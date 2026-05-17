"""Evaluation pipeline: structured scoring + LLM-assisted review + batch reporting."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from rewrite_engine.agents.analyzer import SemanticReport, analyze_all
from rewrite_engine.agents.scheduler import SchedulerAgent, StepResult
from rewrite_engine.agents.validator import ValidationReport, validate
from rewrite_engine.llm.provider import LLMProvider
from rewrite_engine.models.article import Article
from rewrite_engine.models.config import AppConfig


@dataclass
class TestCase:
    name: str
    description: str
    article: Article
    target_indices: list[int]
    expected_behavior: str = ""  # what to expect from the rewrite


@dataclass
class EvaluationReport:
    test_case: TestCase
    validation: ValidationReport | None = None
    semantic_reports: list[SemanticReport] = field(default_factory=list)
    rewrite_history: list[StepResult] = field(default_factory=list)
    duration_seconds: float = 0.0
    error: str | None = None

    @property
    def overall_score(self) -> float:
        scores: list[float] = []
        if self.validation:
            scores.append(self.validation.average_score)
        if self.semantic_reports:
            scores.append(sum(r.similarity for r in self.semantic_reports) / len(self.semantic_reports))
        return round(sum(scores) / len(scores), 1) if scores else 0.0

    def to_dict(self) -> dict:
        return {
            "test_case": self.test_case.name,
            "description": self.test_case.description,
            "overall_score": self.overall_score,
            "duration_seconds": self.duration_seconds,
            "validation": (
                {
                    "coherence": self.validation.coherence,
                    "transition": self.validation.transition,
                    "consistency": self.validation.consistency,
                    "style": self.validation.style,
                    "average": self.validation.average_score,
                    "issues": self.validation.issues,
                    "overall": self.validation.overall,
                }
                if self.validation else None
            ),
            "semantic_analysis": [
                {
                    "paragraph": r.paragraph_index + 1,
                    "similarity": r.similarity,
                    "summary": r.summary,
                }
                for r in self.semantic_reports
            ],
            "rewrite_steps": len(self.rewrite_history),
            "error": self.error,
        }

    def print_report(self) -> None:
        print()
        print("=" * 60)
        print(f"  评估报告: {self.test_case.name}")
        print("=" * 60)
        print(f"  描述: {self.test_case.description}")
        print(f"  耗时: {self.duration_seconds:.1f}s")
        print(f"  综合评分: {self.overall_score}/5")
        print()

        if self.error:
            print(f"  [red]错误: {self.error}[/red]")
            return

        if self.validation:
            v = self.validation
            print("  ── 定性自检（结构化评分）──")
            print(f"  逻辑连贯性: {'★' * v.coherence}{'☆' * (5 - v.coherence)} {v.coherence}/5")
            print(f"  段落衔接:   {'★' * v.transition}{'☆' * (5 - v.transition)} {v.transition}/5")
            print(f"  语义一致性: {'★' * v.consistency}{'☆' * (5 - v.consistency)} {v.consistency}/5")
            print(f"  风格统一性: {'★' * v.style}{'☆' * (5 - v.style)} {v.style}/5")
            if v.issues:
                print(f"  问题: {'; '.join(v.issues)}")
            print()

        if self.semantic_reports:
            print("  ── LLM 辅助评测（语义相似度）──")
            for r in self.semantic_reports:
                print(f"  段落 {r.paragraph_index + 1}: 相似度 {r.similarity}/5 — {r.summary}")
            print()

        print("  ── 改写步骤 ──")
        for step in self.rewrite_history:
            print(f"  段落 {step.paragraph_index + 1}: {len(step.original)} → {len(step.rewritten)} chars")
        print()


class BatchEvaluator:
    """Runs evaluation across multiple test cases."""

    def __init__(self, provider: LLMProvider, config: AppConfig) -> None:
        self.provider = provider
        self.config = config
        self.reports: list[EvaluationReport] = []

    async def evaluate(self, test_case: TestCase) -> EvaluationReport:
        start = time.monotonic()

        report = EvaluationReport(test_case=test_case)

        try:
            # Run rewrite
            scheduler = SchedulerAgent(self.provider, self.config)
            scheduler.init_project(test_case.article, test_case.target_indices)
            result_article = await scheduler.run_auto()

            report.rewrite_history = scheduler.history

            # Build original/rewritten paragraph maps
            original_paras: dict[int, str] = {}
            rewritten_paras: dict[int, str] = {}
            for step in scheduler.history:
                original_paras[step.paragraph_index] = step.original
                rewritten_paras[step.paragraph_index] = step.rewritten

            # Run validation
            report.validation = await validate(
                self.provider,
                test_case.article.to_text(),
                result_article.to_text(),
                test_case.target_indices,
            )

            # Run semantic analysis
            report.semantic_reports = await analyze_all(
                self.provider, original_paras, rewritten_paras,
            )

        except Exception as e:
            report.error = str(e)

        report.duration_seconds = round(time.monotonic() - start, 1)
        self.reports.append(report)
        return report

    def print_summary(self) -> None:
        print()
        print("=" * 60)
        print("  批量评估汇总")
        print("=" * 60)
        for r in self.reports:
            status = f"✗ {r.error}" if r.error else f"✓ {r.overall_score}/5"
            print(f"  {r.test_case.name}: {status}  ({r.duration_seconds:.1f}s)")

        scores = [r.overall_score for r in self.reports if not r.error]
        if scores:
            avg = sum(scores) / len(scores)
            print(f"\n  平均评分: {avg:.1f}/5  (基于 {len(scores)} 个测试用例)")

    def export_json(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps([r.to_dict() for r in self.reports], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def load_test_cases(directory: str | Path = "data/test-cases") -> list[TestCase]:
    """Load test cases from a directory of JSON/YAML files."""
    dir_path = Path(directory)
    if not dir_path.exists():
        return []

    cases: list[TestCase] = []
    for f in sorted(dir_path.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        article = Article.from_text(data["article_text"])
        cases.append(TestCase(
            name=data.get("name", f.stem),
            description=data.get("description", ""),
            article=article,
            target_indices=data.get("target_indices", []),
            expected_behavior=data.get("expected_behavior", ""),
        ))

    return cases
