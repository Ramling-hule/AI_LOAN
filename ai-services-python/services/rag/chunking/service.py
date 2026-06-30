from __future__ import annotations

from services.ocr.extractors.base import DocumentResult
from services.rag.chunking.models import ChunkingContext
from services.rag.chunking.strategies import ChunkingStrategyFactory


def build_document_chunks(
    *,
    document: DocumentResult,
    job_id: str,
    application_id: str,
    document_type: str,
    document_name: str,
    mime_type: str = "",
) -> list[dict]:
    """Create pgvector-compatible chunks using document-aware strategies."""

    context = ChunkingContext(
        document=document,
        job_id=job_id,
        application_id=application_id,
        document_type=document_type,
        document_name=document_name,
        mime_type=mime_type,
    )
    strategy = ChunkingStrategyFactory().create(document_type, document_name)
    return strategy.create_chunks(context)
