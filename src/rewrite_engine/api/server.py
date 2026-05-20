"""FastAPI server for the rewrite engine."""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel as PydanticBase

from rewrite_engine.agents.analyzer import analyze_all
from rewrite_engine.agents.generator import (
    build_rewrite_messages,
    rewrite_with_guidance_stream,
)
from rewrite_engine.agents.scheduler import SchedulerAgent
from rewrite_engine.agents.validator import ValidationReport, validate
from rewrite_engine.api.auth import User, auth
from rewrite_engine.llm.provider import LLMProvider, create_provider
from rewrite_engine.logging import get_logger, setup_logging
from rewrite_engine.models.article import Article, ProjectState
from rewrite_engine.models.config import AppConfig, load_config
from rewrite_engine.models.session import RewriteSession
from rewrite_engine.pipelines.auto import AutoRewriteResult, run_auto_pipeline

app = FastAPI(title="Rewrite Engine API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Global state: loaded at startup
_provider: LLMProvider | None = None
_config: AppConfig | None = None
_schedulers: dict[str, SchedulerAgent] = {}  # legacy interactive sessions
_rewrite_sessions: dict[str, RewriteSession] = {}  # Phase 7 multi-round sessions
_logger = get_logger("server")


# --- Request/Response models ---

class AutoRewriteRequest(PydanticBase):
    article_text: str
    target_indices: list[int]
    model: str | None = None


class InteractiveStartRequest(PydanticBase):
    article_text: str
    target_indices: list[int]
    model: str | None = None


class InteractiveStartResponse(PydanticBase):
    session_id: str
    next_paragraph_index: int
    paragraphs: list[dict[str, Any]]


class CandidatesRequest(PydanticBase):
    paragraph_index: int


class CandidatesResponse(PydanticBase):
    candidates: list[str]


class SelectRequest(PydanticBase):
    paragraph_index: int
    candidate_index: int


class SelectResponse(PydanticBase):
    done: bool
    next_paragraph_index: int | None
    article_text: str | None
    confirmed: list[int]
    paragraphs: list[dict[str, Any]]


class StreamRewriteRequest(PydanticBase):
    article_text: str
    target_indices: list[int]
    temperature: float | None = None


class StreamRegenerateRequest(PydanticBase):
    article_text: str
    paragraph_index: int
    target_indices: list[int]
    confirmed_contents: dict[str, str]  # {paragraph_index: rewritten_content}
    guidance: str = ""


# --- SSE helpers ---


def _sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _build_project_state(
    article: Article, target_indices: list[int], para_idx: int,
    confirmed_contents: dict[str, str],
) -> ProjectState:
    """Build a ProjectState for a single paragraph, honoring already-confirmed rewrites."""
    state = ProjectState.create("stream", article, target_indices)
    # Apply already-confirmed contents from previous paragraphs in this batch
    for key, content in confirmed_contents.items():
        idx = int(key)
        if idx in target_indices and idx != para_idx:
            state.current.paragraphs[idx].content = content
            state.current.paragraphs[idx].lock()
            state.confirmed.append(idx)
            if idx in state.pending:
                state.pending.remove(idx)
    state.current_paragraph_index = para_idx
    return state


async def _stream_single_paragraph(
    provider: LLMProvider,
    article: Article,
    target_indices: list[int],
    para_idx: int,
    confirmed_contents: dict[str, str],
    config: AppConfig,
    queue: asyncio.Queue[dict[str, Any] | None],
) -> None:
    """Stream a single paragraph's rewrite into the queue."""
    try:
        state = _build_project_state(article, target_indices, para_idx, confirmed_contents)
        messages = build_rewrite_messages(state)
        original_len = len(article.paragraphs[para_idx].content)

        await queue.put({"type": "paragraph_start", "paragraph_index": para_idx})
        _logger.info("para_start idx=%d", para_idx)

        accumulated = ""
        token_count = 0
        async for token in provider.chat_stream(
            messages,
            temperature=config.rewrite.temperature,
            max_tokens=config.rewrite.max_tokens,
        ):
            accumulated += token
            token_count += 1
            await queue.put({
                "type": "token",
                "paragraph_index": para_idx,
                "token": token,
            })
            if token_count % 5 == 0:
                await queue.put({
                    "type": "paragraph_progress",
                    "paragraph_index": para_idx,
                    "tokens_so_far": token_count,
                    "original_length": original_len,
                })

        await queue.put({
            "type": "paragraph_done",
            "paragraph_index": para_idx,
            "content": accumulated.strip(),
            "tokens": token_count,
        })
        _logger.info("para_done idx=%d tokens=%d", para_idx, token_count)
    except Exception as e:
        await queue.put({
            "type": "paragraph_error",
            "paragraph_index": para_idx,
            "error": str(e),
        })
        _logger.error("para_error idx=%d: %s", para_idx, e)
    finally:
        await queue.put(None)  # Sentinel: this paragraph is done


async def _sse_generator(queue: asyncio.Queue[dict[str, Any] | None], total: int):
    """Read from the queue and yield SSE-formatted events."""
    finished = 0
    while finished < total:
        item = await queue.get()
        if item is None:
            finished += 1
            continue
        event_type = item.pop("type")
        yield _sse_event(event_type, item)

    yield _sse_event("stream_end", {"all_done": True})


# --- Lifecycle ---

@app.on_event("startup")
async def startup() -> None:
    global _provider, _config
    _config = load_config()
    setup_logging(debug=_config.debug if hasattr(_config, 'debug') else False)
    _logger.info("Server starting")
    model_config = _config.default_model
    _provider = await create_provider(model_config)


@app.on_event("shutdown")
async def shutdown() -> None:
    if _provider and hasattr(_provider, '_client'):
        await _provider._client.close()  # type: ignore


# --- Helper ---

def _paragraphs_to_dict(article: Article) -> list[dict[str, Any]]:
    return [
        {"index": p.index, "content": p.content, "status": p.status.value}
        for p in article.paragraphs
    ]


# --- Mode 1: Auto Rewrite ---

@app.post("/api/rewrite/auto")
async def auto_rewrite(req: AutoRewriteRequest) -> dict[str, Any]:
    if _provider is None or _config is None:
        return {"error": "Server not initialized"}

    article = Article.from_text(req.article_text)

    # Validate indices
    for idx in req.target_indices:
        if idx < 0 or idx >= len(article):
            return {"error": f"Paragraph index {idx} out of range"}

    result = await run_auto_pipeline(_provider, _config, article, req.target_indices)

    return {
        "rewritten": {
            "paragraphs": _paragraphs_to_dict(result.rewritten),
            "text": result.rewritten.to_text(),
        },
        "history": [
            {
                "paragraph_index": s.paragraph_index,
                "original": s.original,
                "rewritten": s.rewritten,
            }
            for s in result.history
        ],
        "validation": (
            {
                "coherence": result.validation.coherence,
                "transition": result.validation.transition,
                "consistency": result.validation.consistency,
                "style": result.validation.style,
                "issues": result.validation.issues,
                "overall": result.validation.overall,
                "average_score": result.validation.average_score,
            }
            if result.validation else None
        ),
        "semantic_reports": [
            {
                "paragraph_index": r.paragraph_index,
                "similarity": r.similarity,
                "summary": r.summary,
            }
            for r in result.semantic_reports
        ],
    }


# --- Mode 2: Interactive ---

@app.post("/api/rewrite/interactive/start")
async def interactive_start(req: InteractiveStartRequest) -> dict[str, Any]:
    if _provider is None or _config is None:
        return {"error": "Server not initialized"}

    article = Article.from_text(req.article_text)

    for idx in req.target_indices:
        if idx < 0 or idx >= len(article):
            return {"error": f"Paragraph index {idx} out of range"}

    session_id = str(uuid.uuid4())[:8]
    scheduler = SchedulerAgent(_provider, _config)
    scheduler.init_project(article, req.target_indices, article_id=session_id)
    _schedulers[session_id] = scheduler

    first_idx = scheduler.state.next_paragraph
    if first_idx is None:
        return {"error": "No paragraphs to rewrite"}

    return {
        "session_id": session_id,
        "next_paragraph_index": first_idx,
        "paragraphs": _paragraphs_to_dict(article),
    }


@app.post("/api/rewrite/interactive/{session_id}/candidates")
async def interactive_candidates(
    session_id: str, req: CandidatesRequest,
) -> dict[str, Any]:
    scheduler = _schedulers.get(session_id)
    if not scheduler:
        return {"error": "Session not found"}

    try:
        scheduler.start_step(req.paragraph_index)
        candidates = await scheduler.generate_candidates_for_current()
        return {"candidates": candidates}
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/rewrite/interactive/{session_id}/select")
async def interactive_select(
    session_id: str, req: SelectRequest,
) -> dict[str, Any]:
    scheduler = _schedulers.get(session_id)
    if not scheduler:
        return {"error": "Session not found"}

    try:
        scheduler.start_step(req.paragraph_index)
        result = scheduler.select_candidate(req.candidate_index)

        done = len(scheduler.state.pending) == 0
        next_idx = scheduler.state.next_paragraph

        return {
            "done": done,
            "next_paragraph_index": next_idx,
            "confirmed": scheduler.state.confirmed,
            "paragraphs": _paragraphs_to_dict(scheduler.state.current),
            "article_text": scheduler.state.current.to_text() if done else None,
        }
    except Exception as e:
        return {"error": str(e)}


# --- Phase 7: SSE Streaming Endpoints ---


@app.post("/api/rewrite/stream/rewrite")
async def stream_rewrite(req: StreamRewriteRequest):
    if _provider is None or _config is None:
        return {"error": "Server not initialized"}

    article = Article.from_text(req.article_text)
    for idx in req.target_indices:
        if idx < 0 or idx >= len(article):
            return {"error": f"Paragraph index {idx} out of range"}

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
    total = len(req.target_indices)

    async def _run_all():
        tasks = [
            _stream_single_paragraph(
                _provider, article, req.target_indices, para_idx,
                {},  # No prior confirmations in batch mode
                _config, queue,
            )
            for para_idx in req.target_indices
        ]
        await asyncio.gather(*tasks)

    # Launch all streaming tasks concurrently
    asyncio.create_task(_run_all())

    return StreamingResponse(
        _sse_generator(queue, total),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/rewrite/stream/regenerate")
async def stream_regenerate(req: StreamRegenerateRequest):
    if _provider is None or _config is None:
        return {"error": "Server not initialized"}

    article = Article.from_text(req.article_text)
    total = len(req.target_indices)
    if req.paragraph_index not in req.target_indices:
        return {"error": "paragraph_index not in target_indices"}

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    async def _run_single():
        try:
            state = _build_project_state(
                article, req.target_indices,
                req.paragraph_index, req.confirmed_contents,
            )
            original_len = len(article.paragraphs[req.paragraph_index].content)

            await queue.put({"type": "paragraph_start", "paragraph_index": req.paragraph_index})
            _logger.info("regenerate_start idx=%d guidance_len=%d", req.paragraph_index, len(req.guidance))

            accumulated = ""
            token_count = 0
            async for token in rewrite_with_guidance_stream(
                _provider, state, req.guidance,
                temperature=_config.rewrite.temperature,
                max_tokens=_config.rewrite.max_tokens,
            ):
                accumulated += token
                token_count += 1
                await queue.put({
                    "type": "token",
                    "paragraph_index": req.paragraph_index,
                    "token": token,
                })
                if token_count % 5 == 0:
                    await queue.put({
                        "type": "paragraph_progress",
                        "paragraph_index": req.paragraph_index,
                        "tokens_so_far": token_count,
                        "original_length": original_len,
                    })

            await queue.put({
                "type": "paragraph_done",
                "paragraph_index": req.paragraph_index,
                "content": accumulated.strip(),
                "tokens": token_count,
            })
            _logger.info("regenerate_done idx=%d tokens=%d", req.paragraph_index, token_count)
        except Exception as e:
            await queue.put({
                "type": "paragraph_error",
                "paragraph_index": req.paragraph_index,
                "error": str(e),
            })
            _logger.error("regenerate_error idx=%d: %s", req.paragraph_index, e)
        finally:
            await queue.put(None)

    asyncio.create_task(_run_single())

    return StreamingResponse(
        _sse_generator(queue, 1),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- Phase 7: Session & Config Endpoints ---


class SessionCreateRequest(PydanticBase):
    article_text: str


class SessionCommitRequest(PydanticBase):
    confirmed_results: dict[str, str]  # {paragraph_index: content}


class ConfigUpdateRequest(PydanticBase):
    model: str | None = None
    temperature: float | None = None
    candidates_count: int | None = None
    max_tokens: int | None = None
    add_model: dict[str, str] | None = None
    delete_model: str | None = None


class StartRoundRequest(PydanticBase):
    target_indices: list[int]


class RecordResultRequest(PydanticBase):
    paragraph_index: int
    content: str


def _get_username(authorization: str = "") -> str:
    """Extract username from Bearer token. Returns empty string if invalid."""
    token = authorization.strip()
    if token.startswith("Bearer "):
        user = auth.verify_token(token[7:].strip())
        return user.username if user else ""
    return ""


def _check_session_owner(session: RewriteSession | None, authorization: str) -> dict[str, Any] | None:
    """Return error dict if session doesn't exist or user doesn't own it."""
    if not session:
        return {"error": "Session not found"}
    username = _get_username(authorization)
    if not username:
        return {"error": "Authentication required"}
    if session.owner and session.owner != username:
        return {"error": "Access denied: not your session"}
    if not session.owner:
        return {"error": "Session has no owner — re-create it"}
    return None


@app.post("/api/rewrite/session/create")
async def session_create(req: SessionCreateRequest, authorization: str = Header(default="")) -> dict[str, Any]:
    if _provider is None or _config is None:
        return {"error": "Server not initialized"}

    username = _get_username(authorization)
    if not username:
        return {"error": "Authentication required"}
    article = Article.from_text(req.article_text)
    session = RewriteSession.create(article, owner=username)
    _rewrite_sessions[session.session_id] = session

    return {
        "session_id": session.session_id,
        "paragraphs": _paragraphs_to_dict(session.current_article),
    }


@app.post("/api/rewrite/session/{session_id}/start-round")
async def session_start_round(
    session_id: str, req: StartRoundRequest, authorization: str = Header(default=""),
) -> dict[str, Any]:
    session = _rewrite_sessions.get(session_id)
    if err := _check_session_owner(session, authorization): return err

    rnd = session.start_round(req.target_indices)
    return {
        "round_num": rnd.round_num,
        "target_indices": rnd.target_indices,
        "paragraphs": _paragraphs_to_dict(session.current_article),
    }


@app.post("/api/rewrite/session/{session_id}/record")
async def session_record(
    session_id: str, req: RecordResultRequest, authorization: str = Header(default=""),
) -> dict[str, Any]:
    session = _rewrite_sessions.get(session_id)
    if err := _check_session_owner(session, authorization): return err

    session.record_result(req.paragraph_index, req.content)
    return {"status": "ok", "results": session.active_round.results if session.active_round else {}}


@app.post("/api/rewrite/session/{session_id}/commit")
async def session_commit(session_id: str, authorization: str = Header(default="")) -> dict[str, Any]:
    session = _rewrite_sessions.get(session_id)
    if err := _check_session_owner(session, authorization): return err

    committed = session.commit_round()
    if committed is None:
        return {"error": "No active round to commit"}

    return {
        "committed_round": committed.round_num,
        "committed_results": committed.results,
        "paragraphs": _paragraphs_to_dict(session.current_article),
        "text": session.current_article.to_text(),
        "round_count": len(session.rounds),
    }


@app.get("/api/rewrite/session/{session_id}")
async def session_status(session_id: str, authorization: str = Header(default="")) -> dict[str, Any]:
    session = _rewrite_sessions.get(session_id)
    if err := _check_session_owner(session, authorization): return err

    return session.to_dict()


@app.get("/api/config")
async def get_config() -> dict[str, Any]:
    if _config is None:
        return {"error": "Server not initialized"}

    return {
        "models": [
            {"name": m.name, "provider": m.provider, "model": m.model}
            for m in _config.models
        ],
        "rewrite": {
            "temperature": _config.rewrite.temperature,
            "max_tokens": _config.rewrite.max_tokens,
            "candidates_count": _config.rewrite.candidates_count,
        },
        "validation": {
            "enabled": _config.validation.enabled,
            "strictness": _config.validation.strictness,
        },
    }


@app.put("/api/config")
async def update_config(req: ConfigUpdateRequest) -> dict[str, Any]:
    global _provider, _config

    if _config is None:
        return {"error": "Server not initialized"}

    if req.model is not None:
        try:
            model_config = _config.get_model(req.model)
        except KeyError:
            return {"error": f"Model '{req.model}' not found"}

        # Recreate provider with new model
        if _provider and hasattr(_provider, '_client'):
            await _provider._client.close()  # type: ignore
        _provider = await create_provider(model_config)

    if req.add_model is not None:
        from rewrite_engine.models.config import ModelConfig
        new_m = ModelConfig(
            name=req.add_model["name"],
            provider=req.add_model.get("provider", "openai"),
            model=req.add_model["model"],
            api_base=req.add_model.get("api_base", "https://api.openai.com/v1"),
            api_key=req.add_model.get("api_key", ""),
        )
        _config.models.append(new_m)

    if req.delete_model is not None:
        if len(_config.models) <= 1:
            return {"error": "Cannot delete the last model"}
        _config.models = [m for m in _config.models if m.name != req.delete_model]
        if _config.default_model.name == req.delete_model:
            # Recreate provider with the new default
            if _provider and hasattr(_provider, '_client'):
                await _provider._client.close()  # type: ignore
            _provider = await create_provider(_config.default_model)

    if req.temperature is not None:
        _config.rewrite.temperature = req.temperature
    if req.candidates_count is not None:
        _config.rewrite.candidates_count = req.candidates_count
    if req.max_tokens is not None:
        _config.rewrite.max_tokens = req.max_tokens

    return {
        "status": "ok",
        "active_model": req.model or (_config.default_model.name),
        "temperature": _config.rewrite.temperature,
        "candidates_count": _config.rewrite.candidates_count,
        "max_tokens": _config.rewrite.max_tokens,
    }


# --- Phase 10: Auth Endpoints ---


class LoginRequest(PydanticBase):
    access_key: str


@app.post("/api/auth/login")
async def auth_login(req: LoginRequest) -> dict[str, Any]:
    result = auth.authenticate(req.access_key)
    if result is None:
        return {"error": "Invalid access key"}
    token, user = result
    return {"token": token, "username": user.username, "role": user.role}


@app.post("/api/auth/verify")
async def auth_verify(authorization: str = Header(default="")) -> dict[str, Any]:
    if not authorization.strip().startswith("Bearer "):
        return {"valid": False}
    token = authorization.strip()[7:]
    user = auth.verify_token(token.strip())
    if user is None:
        return {"valid": False}
    return {"valid": True, "username": user.username, "role": user.role}


@app.post("/api/auth/logout")
async def auth_logout(authorization: str = Header(default="")) -> dict[str, Any]:
    token = authorization.strip()
    if token.startswith("Bearer "):
        auth.logout(token[7:].strip())
    return {"status": "ok"}


# --- Phase 10: Admin Endpoints ---


class AddUserRequest(PydanticBase):
    username: str
    access_key: str
    role: str = "user"


@app.get("/api/admin/users")
async def admin_list_users(user: str = Header(default="", alias="X-Auth-Token")) -> dict[str, Any]:
    u = auth.verify_token(user)
    if not u or u.role != "admin":
        return {"error": "Admin access required"}
    return {"users": auth.list_users()}


@app.post("/api/admin/users")
async def admin_add_user(req: AddUserRequest, user: str = Header(default="", alias="X-Auth-Token")) -> dict[str, Any]:
    u = auth.verify_token(user)
    if not u or u.role != "admin":
        return {"error": "Admin access required"}
    auth.add_user(req.username, req.access_key, req.role)
    return {"status": "ok"}


@app.delete("/api/admin/users/{username}")
async def admin_delete_user(username: str, user: str = Header(default="", alias="X-Auth-Token")) -> dict[str, Any]:
    u = auth.verify_token(user)
    if not u or u.role != "admin":
        return {"error": "Admin access required"}
    auth.delete_user(username)
    return {"status": "ok"}


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# --- Phase 11: Debug Endpoints ---


@app.get("/api/debug/logs")
async def debug_logs(
    lines: int = 100,
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    username = _get_username(authorization)
    if not username:
        return {"error": "Authentication required"}

    log_file = Path("logs/rewrite-engine.log")
    if not log_file.exists():
        return {"lines": [], "total_lines": 0}

    text = log_file.read_text(encoding="utf-8")
    all_lines = text.strip().split("\n")
    tail = all_lines[-lines:] if len(all_lines) > lines else all_lines

    return {"lines": tail, "total_lines": len(all_lines)}


@app.get("/api/debug/sessions")
async def debug_sessions(
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    username = _get_username(authorization)
    if not username:
        return {"error": "Authentication required"}

    sessions = [
        {"session_id": sid, "owner": s.owner, "round_count": len(s.rounds)}
        for sid, s in _rewrite_sessions.items()
        if s.owner == username
    ]
    return {"sessions": sessions, "count": len(sessions)}


def run_server(host: str = "0.0.0.0", port: int | None = None) -> None:
    import uvicorn
    if port is None:
        try:
            port = load_config().server.port
        except Exception:
            port = 8000
    uvicorn.run(app, host=host, port=port)
