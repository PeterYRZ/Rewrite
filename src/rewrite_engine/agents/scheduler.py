from __future__ import annotations

from dataclasses import dataclass

from rewrite_engine.agents.generator import rewrite_with_context
from rewrite_engine.llm.provider import LLMProvider
from rewrite_engine.models.article import Article, ProjectState, Step
from rewrite_engine.models.config import AppConfig


@dataclass
class StepResult:
    """Result of a single rewrite step."""
    paragraph_index: int
    original: str
    rewritten: str
    step: Step


class SchedulerAgent:
    """State machine core. Coordinates other agents, manages context assembly.

    Mode 1 (auto): iterates target paragraphs, rewrites each, advances state.
    Mode 2 (interactive): generates candidates, waits for user selection (Phase 4).
    """

    def __init__(
        self,
        provider: LLMProvider,
        config: AppConfig,
    ) -> None:
        self.provider = provider
        self.config = config
        self.state: ProjectState | None = None
        self.history: list[StepResult] = []

    def init_project(
        self, article: Article, target_indices: list[int], article_id: str = "default"
    ) -> None:
        self.state = ProjectState.create(
            article_id=article_id,
            original=article,
            target_indices=target_indices,
        )
        self.history = []

    async def run_auto(self) -> Article:
        """Mode 1: fully automatic sequential rewrite pipeline."""
        if self.state is None:
            raise RuntimeError("No project initialized. Call init_project() first.")

        self.state.current_step = Step.SCHEDULING

        while self.state.next_paragraph is not None:
            idx = self.state.next_paragraph
            self.state.current_paragraph_index = idx
            self.state.current_step = Step.GENERATING

            rewritten = await rewrite_with_context(
                self.provider,
                self.state,
                temperature=self.config.rewrite.temperature,
                max_tokens=self.config.rewrite.max_tokens,
            )

            self.history.append(StepResult(
                paragraph_index=idx,
                original=self.state.current.paragraphs[idx].content,
                rewritten=rewritten,
                step=Step.GENERATING,
            ))

            self.state.advance(rewritten)

        self.state.current_step = Step.DONE
        return self.state.current

    @property
    def progress(self) -> str:
        """Human-readable progress string."""
        if self.state is None:
            return "No project"
        total = len(self.state.target_indices)
        done = len(self.state.confirmed)
        return f"{done}/{total} paragraphs rewritten"
