"""Semantic Analyzer Agent — computes similarity and extracts diff summaries."""

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from rewrite_engine.llm.provider import LLMProvider, Message


def _extract_json(text: str) -> str:
    """Robust JSON extraction from LLM response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return text.strip()


ANALYZER_SYSTEM_PROMPT = """\
你是一个文本语义分析专家。你的任务是比对原文段落和改写后段落，分析其语义变化。

评估维度：
1. **语义相似度**（1-5）：改写段落保留原文核心语义的程度
   - 5 = 语义完全一致，仅表达方式不同
   - 4 = 核心语义保留，细微调整
   - 3 = 部分语义调整，但主旨不变
   - 2 = 语义有较大偏移
   - 1 = 完全改变了原意

2. **差异摘要**：用一两句话概括改写带来的主要变化（内容增删、侧重点转移、语气变化等）

输出格式（只输出 JSON，不要任何其他文字）：
{"similarity": 4, "summary": "改写保留了原文关于AI医疗应用的核心论述，增加了对辅助诊断流程的具体描述，语气更加积极。"}
"""


class SemanticReport(BaseModel):
    paragraph_index: int
    similarity: int = Field(ge=1, le=5)
    summary: str = ""


def build_analysis_messages(
    original_paragraph: str,
    rewritten_paragraph: str,
    paragraph_index: int,
) -> list[Message]:
    user_message = (
        f"请比对以下段落 {paragraph_index + 1} 的原文和改写版本。\n\n"
        f"=== 原文 ===\n"
        f"{original_paragraph}\n\n"
        f"=== 改写后 ===\n"
        f"{rewritten_paragraph}\n\n"
        "请按照 JSON 格式输出分析结果。"
    )

    return [
        {"role": "system", "content": ANALYZER_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


async def analyze_paragraph(
    provider: LLMProvider,
    original_paragraph: str,
    rewritten_paragraph: str,
    paragraph_index: int,
    *,
    temperature: float = 0.2,
) -> SemanticReport:
    """Analyze semantic similarity between original and rewritten paragraph."""
    messages = build_analysis_messages(
        original_paragraph, rewritten_paragraph, paragraph_index
    )

    response = await provider.chat(messages, temperature=temperature, max_tokens=500)
    json_str = _extract_json(response)
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"  [warn] 语义分析JSON解析失败 (段落{paragraph_index + 1}): {e}")
        return SemanticReport(
            paragraph_index=paragraph_index,
            similarity=3,
            summary="解析失败，建议人工复核",
        )
    return SemanticReport(
        paragraph_index=paragraph_index,
        similarity=data["similarity"],
        summary=data["summary"],
    )


async def analyze_all(
    provider: LLMProvider,
    original_paragraphs: dict[int, str],
    rewritten_paragraphs: dict[int, str],
    *,
    temperature: float = 0.2,
) -> list[SemanticReport]:
    """Analyze all rewritten paragraphs and return reports."""
    reports: list[SemanticReport] = []
    for idx in sorted(rewritten_paragraphs.keys()):
        report = await analyze_paragraph(
            provider,
            original_paragraphs[idx],
            rewritten_paragraphs[idx],
            idx,
            temperature=temperature,
        )
        reports.append(report)
    return reports
