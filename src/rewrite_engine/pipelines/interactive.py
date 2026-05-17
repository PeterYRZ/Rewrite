"""Mode 2: interactive rewrite pipeline with candidate selection."""

from __future__ import annotations

from rewrite_engine.agents.scheduler import SchedulerAgent
from rewrite_engine.llm.provider import LLMProvider
from rewrite_engine.models.article import Article
from rewrite_engine.models.config import AppConfig


class InteractiveSession:
    """Manages an interactive rewrite session.

    For each target paragraph:
    1. Generate N candidate rewrites
    2. Present candidates to user
    3. User selects one or requests regeneration
    4. Lock the chosen paragraph and proceed to next
    """

    def __init__(self, scheduler: SchedulerAgent) -> None:
        self.scheduler = scheduler

    @property
    def state(self):
        return self.scheduler.state

    async def get_candidates(
        self, paragraph_index: int, regenerate: bool = False
    ) -> list[str]:
        """Generate (or retrieve cached) candidates for a paragraph."""
        key = str(paragraph_index)
        if not regenerate and key in self.state.candidates:
            return self.state.candidates[key]

        self.scheduler.start_step(paragraph_index)
        candidates = await self.scheduler.generate_candidates_for_current()
        return candidates

    def select(self, choice_index: int) -> str:
        """Select a candidate and advance to next paragraph."""
        result = self.scheduler.select_candidate(choice_index)
        return result.rewritten

    @property
    def all_confirmed(self) -> bool:
        return self.state is not None and len(self.state.pending) == 0

    def current_article_view(self) -> str:
        """Return the article with status markers for display."""
        parts: list[str] = []
        for p in self.scheduler.state.current.paragraphs:
            status = p.status.value.upper()
            tag = f"[{status}]"
            parts.append(f"  {tag} 段落 {p.index + 1}: {p.content[:80]}{'...' if len(p.content) > 80 else ''}")
        return "\n".join(parts)


async def run_interactive_session(
    provider: LLMProvider,
    config: AppConfig,
    article: Article,
    target_indices: list[int],
) -> InteractiveSession:
    """Create and initialize an interactive rewrite session."""
    scheduler = SchedulerAgent(provider, config)
    scheduler.init_project(article, target_indices)
    return InteractiveSession(scheduler)
