"""Validator Agent — checks semantic consistency and logical coherence after rewriting."""

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from rewrite_engine.llm.provider import LLMProvider, Message


def _extract_json(text: str) -> str:
    """Robust JSON extraction from LLM response."""
    text = text.strip()
    # Remove markdown code fences
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    # Try to find JSON object boundaries
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return text.strip()

VALIDATOR_SYSTEM_PROMPT = """\
你是一个严格的文章审校专家。你的任务是检查一篇经过部分段落改写的文章是否存在逻辑断裂、语义矛盾或衔接问题。

评估维度：
1. **逻辑连贯性**（1-5）：段落之间的逻辑推进是否自然，有无跳跃或断裂
2. **段落衔接**（1-5）：改写段落与前后段的过渡是否平滑
3. **语义一致性**（1-5）：改写段落是否与全文主旨一致，有无自相矛盾
4. **风格统一性**（1-5）：改写段落的语气和风格是否与全文协调

评分标准：
- 5 = 完美，无任何问题
- 4 = 良好，有轻微可改进之处
- 3 = 合格，存在明显但不严重的问题
- 2 = 较差，有影响阅读体验的问题
- 1 = 严重，存在逻辑矛盾或语义断裂

输出格式（只输出 JSON，不要任何其他文字）：
{"coherence": 4, "transition": 3, "consistency": 5, "style": 4, "issues": ["段落X与段落Y的衔接略显生硬"], "overall": "改写整体质量良好，但在...方面仍有提升空间"}
"""


class ValidationReport(BaseModel):
    coherence: int = Field(ge=1, le=5, description="Logical coherence score")
    transition: int = Field(ge=1, le=5, description="Paragraph transition smoothness")
    consistency: int = Field(ge=1, le=5, description="Semantic consistency")
    style: int = Field(ge=1, le=5, description="Style uniformity")
    issues: list[str] = Field(default_factory=list)
    overall: str = ""

    @property
    def average_score(self) -> float:
        return (self.coherence + self.transition + self.consistency + self.style) / 4


def build_validation_messages(
    original_text: str,
    rewritten_text: str,
    rewritten_indices: list[int],
) -> list[Message]:
    para_list = ", ".join(str(i + 1) for i in rewritten_indices)
    user_message = (
        "请评估以下改写结果。\n\n"
        f"改写的段落：第 {para_list} 段\n\n"
        "=== 原文 ===\n"
        f"{original_text}\n\n"
        "=== 改写后 ===\n"
        f"{rewritten_text}\n\n"
        "请按照 JSON 格式输出评估结果。"
    )

    return [
        {"role": "system", "content": VALIDATOR_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


async def validate(
    provider: LLMProvider,
    original_text: str,
    rewritten_text: str,
    rewritten_indices: list[int],
    *,
    temperature: float = 0.3,
) -> ValidationReport:
    """Run validation check on the rewritten article."""
    messages = build_validation_messages(original_text, rewritten_text, rewritten_indices)

    max_retries = 2
    for attempt in range(max_retries):
        response = await provider.chat(messages, temperature=temperature, max_tokens=1000)
        json_str = _extract_json(response)
        if not json_str:
            if attempt < max_retries - 1:
                continue
            print("  [warn] 校验Agent返回空响应")
            return ValidationReport(
                coherence=3, transition=3, consistency=3, style=3,
                issues=["校验Agent返回空响应，使用默认评分"],
                overall="自动校验失败，建议人工复核。",
            )
        try:
            data = json.loads(json_str)
            return ValidationReport(**data)
        except (json.JSONDecodeError, ValueError) as e:
            if attempt < max_retries - 1:
                continue
            print(f"  [warn] 校验JSON解析失败: {e}")
            return ValidationReport(
                coherence=3, transition=3, consistency=3, style=3,
                issues=["校验Agent响应格式异常，使用默认评分"],
                overall="自动校验失败，建议人工复核。",
            )
