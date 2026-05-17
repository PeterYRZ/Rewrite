from __future__ import annotations

from rewrite_engine.llm.provider import LLMProvider, Message


REWRITE_SYSTEM_PROMPT = """\
你是一个专业写作助手。你的任务是在保持全文逻辑连贯性的前提下，仅改写文章中指定的目标段落。

要求：
1. 仅改写指定的目标段落，不改动其他段落
2. 保持改写后的段落与前后段落的自然衔接和逻辑连贯
3. 保留原文的核心信息和主旨，但可以使用不同的表达方式
4. 保持与原文一致的写作风格和语气
5. 直接输出改写后的完整段落内容，不要添加解释或标记"""


def build_single_rewrite_messages(
    article_text: str,
    paragraph_index: int,
    paragraph_content: str,
) -> list[Message]:
    """Build messages for rewriting a single paragraph with full article context."""
    paragraphs = article_text.split("\n\n")
    # Mark the target paragraph in context
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
    """Rewrite a single paragraph within the context of the full article."""
    paragraphs = article_text.split("\n\n")
    target_content = paragraphs[paragraph_index]

    messages = build_single_rewrite_messages(
        article_text, paragraph_index, target_content
    )

    rewritten = await provider.chat(
        messages, temperature=temperature, max_tokens=max_tokens
    )

    return rewritten.strip()
