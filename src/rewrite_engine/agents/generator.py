from __future__ import annotations

from rewrite_engine.llm.provider import LLMProvider, Message
from rewrite_engine.models.article import ParagraphStatus, ProjectState

REWRITE_SYSTEM_PROMPT = """\
你是一个专业写作助手。你的任务是在保持全文逻辑连贯性的前提下，仅改写文章中指定的目标段落。

要求：
1. 仅改写 [TO_REWRITE] 标记的目标段落，不改动其他段落
2. 保持改写后的段落与前后段落的自然衔接和逻辑连贯
3. 保留原文的核心信息和主旨，但可以使用不同的表达方式
4. 保持与原文一致的写作风格和语气
5. 直接输出改写后的完整段落内容，不要添加解释或标记"""


def build_rewrite_messages(state: ProjectState) -> list[Message]:
    """Build messages using ProjectState's dual-document context."""
    context = state.build_context()
    para_num = (state.current_paragraph_index or 0) + 1

    user_message = (
        "以下是需要处理的文章。\n\n"
        f"{context}\n\n"
        f"请仅改写 [TO_REWRITE] 标记的段落（段落{para_num}），"
        "保持与其他段落（尤其是 [LOCKED] 段落）的自然衔接。"
        "直接输出改写后的段落内容。"
    )

    return [
        {"role": "system", "content": REWRITE_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


async def rewrite_with_context(
    provider: LLMProvider,
    state: ProjectState,
    *,
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> str:
    """Rewrite the current TO_REWRITE paragraph using dual-document context."""
    messages = build_rewrite_messages(state)
    rewritten = await provider.chat(
        messages, temperature=temperature, max_tokens=max_tokens
    )
    return rewritten.strip()


CANDIDATES_SYSTEM_PROMPT = """\
你是一个专业写作助手。你的任务是在保持全文逻辑连贯性的前提下，为指定的段落生成多个不同风格的改写候选。

要求：
1. 仅改写 [TO_REWRITE] 标记的目标段落，不改动其他段落
2. 每个候选都需保持与前后段落的自然衔接和逻辑连贯
3. 保留原文的核心信息和主旨，但使用不同的表达方式和措辞
4. 不同候选之间应在句式结构、用词选择、语气侧重上有明显差异
5. 每个候选用 "---CANDIDATE---" 分隔，直接输出改写内容，不要编号或解释"""


def build_candidates_messages(state: ProjectState, count: int) -> list[Message]:
    context = state.build_context()
    para_num = (state.current_paragraph_index or 0) + 1

    user_message = (
        "以下是需要处理的文章。\n\n"
        f"{context}\n\n"
        f"请为 [TO_REWRITE] 标记的段落（段落{para_num}）生成 {count} 个不同风格的改写候选。"
        "每个候选用 ---CANDIDATE--- 分隔。"
        "确保候选之间在措辞、句式、侧重点上有明显差异。"
        "直接输出改写内容，不要添加编号或解释。"
    )

    return [
        {"role": "system", "content": CANDIDATES_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


async def generate_candidates(
    provider: LLMProvider,
    state: ProjectState,
    count: int = 3,
    *,
    temperature: float = 0.8,
    max_tokens: int = 3000,
) -> list[str]:
    """Generate multiple rewrite candidates for the current paragraph."""
    messages = build_candidates_messages(state, count)
    response = await provider.chat(
        messages, temperature=temperature, max_tokens=max_tokens
    )
    candidates = [c.strip() for c in response.split("---CANDIDATE---") if c.strip()]
    return candidates[:count]


# ---- Phase 1 single-paragraph helpers (kept for backward compatibility) ----


def build_single_rewrite_messages(
    article_text: str,
    paragraph_index: int,
    paragraph_content: str,
) -> list[Message]:
    paragraphs = article_text.split("\n\n")
    marked: list[str] = []
    for i, p in enumerate(paragraphs):
        if i == paragraph_index:
            marked.append(f"[TARGET - 段落{i + 1} - 请改写此段]\n{p}")
        else:
            marked.append(f"[段落{i + 1}]\n{p}")

    context = "\n\n".join(marked)

    user_message = (
        "以下是需要处理的文章，其中标记了需要改写的目标段落。\n\n"
        f"{context}\n\n"
        f"请仅改写 [TARGET] 标记的段落（段落{paragraph_index + 1}），"
        "保持与其他段落的自然衔接。直接输出改写后的段落内容。"
    )

    return [
        {"role": "system", "content": REWRITE_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


async def rewrite_single_paragraph(
    provider: LLMProvider,
    article_text: str,
    paragraph_index: int,
    *,
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> str:
    paragraphs = article_text.split("\n\n")
    target_content = paragraphs[paragraph_index]

    messages = build_single_rewrite_messages(
        article_text, paragraph_index, target_content
    )

    rewritten = await provider.chat(
        messages, temperature=temperature, max_tokens=max_tokens
    )

    return rewritten.strip()
