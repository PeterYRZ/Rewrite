from __future__ import annotations

from rewrite_engine.agents.analyzer import SemanticReport, analyze_all
from rewrite_engine.agents.scheduler import SchedulerAgent
from rewrite_engine.agents.validator import ValidationReport, validate
from rewrite_engine.llm.provider import LLMProvider
from rewrite_engine.models.article import Article
from rewrite_engine.models.config import AppConfig


class AutoRewriteResult:
    def __init__(
        self,
        original: Article,
        rewritten: Article,
        history: list,
        validation: ValidationReport | None = None,
        semantic_reports: list[SemanticReport] | None = None,
    ) -> None:
        self.original = original
        self.rewritten = rewritten
        self.history = history
        self.validation = validation
        self.semantic_reports = semantic_reports or []

    def print_summary(self) -> None:
        print()
        print("=" * 60)
        print("  改写完成 — 段落对比")
        print("=" * 60)
        for step in self.history:
            print(f"\n--- 段落 {step.paragraph_index + 1} ---")
            print(f"原文: {step.original[:120]}{'...' if len(step.original) > 120 else ''}")
            print(f"改写: {step.rewritten[:120]}{'...' if len(step.rewritten) > 120 else ''}")

        if self.validation:
            self._print_validation()
        if self.semantic_reports:
            self._print_semantic_analysis()

    def _print_validation(self) -> None:
        v = self.validation
        print()
        print("=" * 60)
        print("  质量评估报告")
        print("=" * 60)
        print(f"  逻辑连贯性: {'★' * v.coherence}{'☆' * (5 - v.coherence)} ({v.coherence}/5)")
        print(f"  段落衔接:   {'★' * v.transition}{'☆' * (5 - v.transition)} ({v.transition}/5)")
        print(f"  语义一致性: {'★' * v.consistency}{'☆' * (5 - v.consistency)} ({v.consistency}/5)")
        print(f"  风格统一性: {'★' * v.style}{'☆' * (5 - v.style)} ({v.style}/5)")
        print(f"  综合均分:   {v.average_score:.1f}/5")
        if v.issues:
            print(f"\n  发现的问题:")
            for issue in v.issues:
                print(f"    • {issue}")
        if v.overall:
            print(f"\n  总体评价: {v.overall}")

    def _print_semantic_analysis(self) -> None:
        print()
        print("=" * 60)
        print("  语义相似度分析")
        print("=" * 60)
        for r in self.semantic_reports:
            print(f"\n  段落 {r.paragraph_index + 1}:")
            print(f"    相似度: {'★' * r.similarity}{'☆' * (5 - r.similarity)} ({r.similarity}/5)")
            print(f"    变化摘要: {r.summary}")


async def run_auto_pipeline(
    provider: LLMProvider,
    config: AppConfig,
    article: Article,
    target_indices: list[int],
    *,
    with_validation: bool = True,
) -> AutoRewriteResult:
    """Run Mode 1: full-auto sequential rewrite with validation and analysis."""
    scheduler = SchedulerAgent(provider, config)
    scheduler.init_project(article, target_indices)

    total = len(target_indices)
    print(f"共 {total} 个段落待改写")
    for i in range(total):
        idx = target_indices[i]
        print(f"  [{i + 1}/{total}] 正在改写段落 {idx + 1}...")

    result_article = await scheduler.run_auto()

    for step in scheduler.history:
        print(f"  段落 {step.paragraph_index + 1}: {len(step.original)} → {len(step.rewritten)} chars")

    # Build original/rewritten paragraph maps for analysis
    original_paras: dict[int, str] = {}
    rewritten_paras: dict[int, str] = {}
    for step in scheduler.history:
        original_paras[step.paragraph_index] = step.original
        rewritten_paras[step.paragraph_index] = step.rewritten

    # Run validation and analysis
    validation: ValidationReport | None = None
    semantic_reports: list[SemanticReport] = []

    if with_validation:
        print("\n正在评估改写质量...")
        validation = await validate(
            provider,
            article.to_text(),
            result_article.to_text(),
            target_indices,
        )
        print(f"  综合均分: {validation.average_score:.1f}/5")

        print("正在分析语义变化...")
        semantic_reports = await analyze_all(
            provider,
            original_paras,
            rewritten_paras,
        )
        for r in semantic_reports:
            print(f"  段落 {r.paragraph_index + 1} 相似度: {r.similarity}/5")

    return AutoRewriteResult(
        original=article,
        rewritten=result_article,
        history=scheduler.history,
        validation=validation,
        semantic_reports=semantic_reports,
    )
