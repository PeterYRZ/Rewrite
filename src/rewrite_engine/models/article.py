from __future__ import annotations

from enum import Enum
from typing import Self

from pydantic import BaseModel, Field


class ParagraphStatus(str, Enum):
    ORIGINAL = "original"
    LOCKED = "locked"
    TO_REWRITE = "to_rewrite"
    REWRITTEN = "rewritten"


class Paragraph(BaseModel):
    index: int
    content: str
    status: ParagraphStatus = ParagraphStatus.ORIGINAL

    def lock(self) -> None:
        self.status = ParagraphStatus.LOCKED

    def mark_for_rewrite(self) -> None:
        self.status = ParagraphStatus.TO_REWRITE

    def set_rewritten(self, content: str) -> None:
        self.content = content
        self.status = ParagraphStatus.REWRITTEN


class Article(BaseModel):
    paragraphs: list[Paragraph]

    @classmethod
    def from_text(cls, text: str, paragraph_sep: str = "\n\n") -> Self:
        paragraphs = [
            Paragraph(index=i, content=p.strip())
            for i, p in enumerate(text.split(paragraph_sep))
            if p.strip()
        ]
        return cls(paragraphs=paragraphs)

    def to_text(self) -> str:
        return "\n\n".join(p.content for p in self.paragraphs)

    def get_paragraph(self, index: int) -> Paragraph:
        return self.paragraphs[index]

    def set_paragraph(self, index: int, content: str) -> None:
        self.paragraphs[index].content = content

    def clone(self) -> Article:
        return Article(paragraphs=[p.model_copy(deep=True) for p in self.paragraphs])

    def __len__(self) -> int:
        return len(self.paragraphs)


class Step(str, Enum):
    IDLE = "idle"
    SCHEDULING = "scheduling"
    GENERATING = "generating"
    VALIDATING = "validating"
    WAITING_USER = "waiting_user"
    MERGING = "merging"
    DONE = "done"


class ProjectState(BaseModel):
    article_id: str
    original: Article
    current: Article
    target_indices: list[int]
    confirmed: list[int] = Field(default_factory=list)
    pending: list[int] = Field(default_factory=list)
    current_paragraph_index: int | None = None
    current_step: Step = Step.IDLE
    candidates: dict[str, list[str]] = Field(default_factory=dict)

    @classmethod
    def create(cls, article_id: str, original: Article, target_indices: list[int]) -> Self:
        current = original.clone()
        for i in target_indices:
            current.paragraphs[i].mark_for_rewrite()
        return cls(
            article_id=article_id,
            original=original,
            current=current,
            target_indices=sorted(target_indices),
            pending=sorted(target_indices),
        )

    @property
    def next_paragraph(self) -> int | None:
        if self.pending:
            return self.pending[0]
        return None

    def advance(self, chosen_content: str) -> None:
        """Confirm the current paragraph rewrite and advance to the next."""
        if self.current_paragraph_index is None:
            return
        idx = self.current_paragraph_index
        self.current.set_paragraph(idx, chosen_content)
        self.current.paragraphs[idx].lock()
        self.confirmed.append(idx)
        self.pending.remove(idx)
        self.candidates.pop(str(idx), None)
        self.current_paragraph_index = None

    def build_context(self) -> str:
        """Assemble clean context for the LLM: original full text + current state with markers."""
        original_text = self.original.to_text()

        parts: list[str] = []
        for p in self.current.paragraphs:
            if p.index == self.current_paragraph_index:
                parts.append(f'[TO_REWRITE - Paragraph {p.index + 1}]\n{p.content}')
            elif p.status == ParagraphStatus.LOCKED:
                parts.append(f'[LOCKED - Paragraph {p.index + 1}]\n{p.content}')
            else:
                parts.append(f'[UNCHANGED - Paragraph {p.index + 1}]\n{p.content}')
        current_text = "\n\n".join(parts)

        return (
            "=== 原文全文（风格参考） ===\n"
            f"{original_text}\n\n"
            "=== 当前最新版本 ===\n"
            f"{current_text}"
        )
