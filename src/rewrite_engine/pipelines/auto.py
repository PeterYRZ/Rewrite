from __future__ import annotations

from rewrite_engine.agents.scheduler import SchedulerAgent
from rewrite_engine.llm.provider import LLMProvider
from rewrite_engine.models.article import Article
from rewrite_engine.models.config import AppConfig


class AutoRewriteResult:
    def __init__(
        self,
        original: Article,
        rewritten: Article,
        history: list,
    ) -> None:
        self.original = original
        self.rewritten = rewritten
        self.history = history

    def print_summary(self) -> None:
        print()
        print("=" * 60)
        print("  改写完成")
        print("=" * 60)
        for step in self.history:
            print(f"\n--- 段落 {step.paragraph_index + 1} ---")
            print(f"原文: {step.original[:120]}{'...' if len(step.original) > 120 else ''}")
            print(f"改写: {step.rewritten[:120]}{'...' if len(step.rewritten) > 120 else ''}")


async def run_auto_pipeline(
    provider: LLMProvider,
    config: AppConfig,
    article: Article,
    target_indices: list[int],
) -> AutoRewriteResult:
    """Run Mode 1: full-auto sequential rewrite.

    For each target paragraph in order, the scheduler:
    1. Assembles clean dual-document context (original + current with status markers)
    2. Calls the generator to rewrite the current target paragraph
    3. Locks the rewritten paragraph and advances to the next
    """
    scheduler = SchedulerAgent(provider, config)
    scheduler.init_project(article, target_indices)

    total = len(target_indices)
    for i, idx in enumerate(target_indices):
        print(f"[{i + 1}/{total}] 正在改写段落 {idx + 1}...")

    result_article = await scheduler.run_auto()

    for step in scheduler.history:
        print(f"  段落 {step.paragraph_index + 1}: {len(step.original)} → {len(step.rewritten)} chars")

    return AutoRewriteResult(
        original=article,
        rewritten=result_article,
        history=scheduler.history,
    )
