from __future__ import annotations

from dataclasses import dataclass, field

from rewrite_engine.agents.generator import (
    generate_candidates,
    rewrite_with_context,
)
from rewrite_engine.llm.provider import LLMProvider
from rewrite_engine.models.article import Article, ProjectState, Step
from rewrite_engine.models.config import AppConfig


@dataclass
class StepResult:
    """Result of a single rewrite step."""
    paragraph_index: int
    original: str
    rewritten: str
    candidates: list[str] = field(default_factory=list)
    chosen_index: int | None = None
    step: Step = Step.GENERATING


class SchedulerAgent:
    """State machine core. Coordinates other agents, manages context assembly.

    Mode 1 (auto): iterates target paragraphs, rewrites each, advances state.
    Mode 2 (interactive): generates candidates, waits for user selection.
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

    # ---- Mode 1: Auto ----

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

    # ---- Mode 2: Interactive ----

    def start_step(self, paragraph_index: int) -> None:
        """Prepare state for rewriting a specific paragraph."""
        if self.state is None:
            raise RuntimeError("No project initialized.")
        self.state.current_paragraph_index = paragraph_index
        self.state.current_step = Step.GENERATING

    async def generate_candidates_for_current(self) -> list[str]:
        """Generate multiple rewrite candidates for the current target paragraph."""
        if self.state is None or self.state.current_paragraph_index is None:
            raise RuntimeError("No paragraph selected. Call start_step() first.")

        candidates = await generate_candidates(
            self.provider,
            self.state,
            count=self.config.rewrite.candidates_count,
            temperature=self.config.rewrite.temperature,
        )

        key = str(self.state.current_paragraph_index)
        self.state.candidates[key] = candidates

        return candidates

    def select_candidate(self, choice_index: int) -> StepResult:
        """User selects a candidate. Advances state, locks the paragraph."""
        if self.state is None or self.state.current_paragraph_index is None:
            raise RuntimeError("No active step.")

        idx = self.state.current_paragraph_index
        key = str(idx)
        candidates = self.state.candidates.get(key, [])
        chosen = candidates[choice_index] if 0 <= choice_index < len(candidates) else ""

        result = StepResult(
            paragraph_index=idx,
            original=self.state.original.paragraphs[idx].content,
            rewritten=chosen,
            candidates=candidates,
            chosen_index=choice_index,
            step=Step.GENERATING,
        )
        self.history.append(result)

        self.state.advance(chosen)
        return result

    @property
    def progress(self) -> str:
        if self.state is None:
            return "No project"
        total = len(self.state.target_indices)
        done = len(self.state.confirmed)
        return f"{done}/{total} paragraphs rewritten"
