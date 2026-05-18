"""FastAPI server for the rewrite engine."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel as PydanticBase

from rewrite_engine.agents.analyzer import analyze_all
from rewrite_engine.agents.scheduler import SchedulerAgent
from rewrite_engine.agents.validator import ValidationReport, validate
from rewrite_engine.llm.provider import LLMProvider, create_provider
from rewrite_engine.models.article import Article
from rewrite_engine.models.config import AppConfig, load_config
from rewrite_engine.pipelines.auto import AutoRewriteResult, run_auto_pipeline

app = FastAPI(title="Rewrite Engine API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Global state: loaded at startup
_provider: LLMProvider | None = None
_config: AppConfig | None = None
_sessions: dict[str, SchedulerAgent] = {}


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


# --- Lifecycle ---

@app.on_event("startup")
async def startup() -> None:
    global _provider, _config
    _config = load_config()
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
    _sessions[session_id] = scheduler

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
    scheduler = _sessions.get(session_id)
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
    scheduler = _sessions.get(session_id)
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


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def run_server(host: str = "0.0.0.0", port: int = 8000) -> None:
    import uvicorn
    uvicorn.run(app, host=host, port=port)
