from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from services.ocr.extractors.base import DocumentResult, PageResult


@dataclass(frozen=True)
class ChunkingContext:
    """Input required to create pgvector-compatible chunks."""

    document: DocumentResult
    job_id: str
    application_id: str
    document_type: str
    document_name: str
    mime_type: str = ""


@dataclass(frozen=True)
class TextUnit:
    """Smallest layout-aware text unit currently available from OCR."""

    text: str
    page_number: int | None = None
    section_title: str | None = None
    confidence: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_page(cls, page: PageResult) -> "TextUnit":
        return cls(
            text=page.text or "",
            page_number=page.page_number,
            confidence=page.confidence,
            metadata={
                "word_count": page.word_count,
                "char_count": page.char_count,
                "processing_time_ms": page.processing_time_ms,
            },
        )
