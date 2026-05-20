"""Multi-round rewrite session models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from rewrite_engine.models.article import Article


class RewriteRound(BaseModel):
    round_num: int
    target_indices: list[int]
    results: dict[int, str] = Field(default_factory=dict)  # para_index → content
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    committed_at: str | None = None


class RewriteSession(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    owner: str = ""  # username of the session owner
    original_article: Article
    current_article: Article
    rounds: list[RewriteRound] = Field(default_factory=list)
    active_round: RewriteRound | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @classmethod
    def create(cls, article: Article, owner: str = "") -> RewriteSession:
        return cls(
            owner=owner,
            original_article=article,
            current_article=article.clone(),
        )

    def start_round(self, target_indices: list[int]) -> RewriteRound:
        """Begin a new rewrite round with the given target paragraphs."""
        round_num = len(self.rounds) + 1
        self.active_round = RewriteRound(
            round_num=round_num,
            target_indices=sorted(target_indices),
        )
        return self.active_round

    def record_result(self, paragraph_index: int, content: str) -> None:
        """Record a confirmed rewrite result for the active round."""
        if self.active_round is None:
            raise RuntimeError("No active round")
        self.active_round.results[paragraph_index] = content

    def commit_round(self) -> RewriteRound | None:
        """Commit the active round: update current_article, archive the round."""
        if self.active_round is None:
            return None

        for idx, content in self.active_round.results.items():
            self.current_article.set_paragraph(idx, content)

        self.active_round.committed_at = datetime.now(timezone.utc).isoformat()
        self.rounds.append(self.active_round)
        committed = self.active_round
        self.active_round = None
        return committed

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "current_article": {
                "paragraphs": [
                    {"index": p.index, "content": p.content, "status": p.status.value}
                    for p in self.current_article.paragraphs
                ],
                "text": self.current_article.to_text(),
            },
            "rounds": [
                {
                    "round_num": r.round_num,
                    "target_indices": r.target_indices,
                    "results": r.results,
                    "committed": r.committed_at is not None,
                }
                for r in self.rounds
            ],
            "active_round": (
                {
                    "round_num": self.active_round.round_num,
                    "target_indices": self.active_round.target_indices,
                    "results": self.active_round.results,
                }
                if self.active_round else None
            ),
            "round_count": len(self.rounds),
        }
