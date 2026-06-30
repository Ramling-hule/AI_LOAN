from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from services.rag.chunking.facts import StructuredFactExtractor
from services.rag.chunking.models import ChunkingContext, TextUnit
from services.rag.chunking.utils import (
    count_tokens,
    group_table_rows,
    merge_small_blocks,
    normalize_document_type,
    split_paragraphs,
    split_sections,
    split_tokens,
)

MIN_CHUNK_CHARS = 30


class ChunkingStrategy(ABC):
    """Strategy interface for document-type-aware chunking."""

    def __init__(
        self,
        max_tokens: int = 750,
        overlap_tokens: int = 100,
        target_tokens: int = 450,
        fact_extractor: StructuredFactExtractor | None = None,
    ) -> None:
        self.max_tokens = max_tokens
        self.overlap_tokens = overlap_tokens
        self.target_tokens = target_tokens
        self.fact_extractor = fact_extractor or StructuredFactExtractor()

    @abstractmethod
    def build_units(self, context: ChunkingContext) -> list[TextUnit]:
        """Return layout-aware units that should be chunked independently."""

    def create_chunks(self, context: ChunkingContext) -> list[dict[str, Any]]:
        normalized_type = normalize_document_type(context.document_type, context.document_name)
        document_facts = self.fact_extractor.extract(context.document.raw_text, normalized_type)
        chunks: list[dict[str, Any]] = []

        for unit in self.build_units(context):
            for chunk_text in self._split_unit(unit):
                if len(chunk_text.strip()) < MIN_CHUNK_CHARS:
                    continue
                chunk_index = len(chunks)
                chunk_facts = self.fact_extractor.extract(chunk_text, normalized_type)
                chunks.append(
                    {
                        "application_id": context.application_id,
                        "source_document": context.job_id,
                        "document_type": normalized_type,
                        "document_name": context.document_name,
                        "chunk_index": chunk_index,
                        "page_number": unit.page_number,
                        "chunk_text": chunk_text.strip(),
                        "metadata": {
                            "job_id": context.job_id,
                            "document_id": context.job_id,
                            "chunk_index": chunk_index,
                            "document_type": normalized_type,
                            "original_document_type": context.document_type,
                            "document_name": context.document_name,
                            "page_number": unit.page_number,
                            "section_title": unit.section_title,
                            "ocr_confidence": unit.confidence,
                            "pdf_type": context.document.pdf_type,
                            "language_detected": context.document.language_detected,
                            "chunking_strategy": self.__class__.__name__,
                            "token_count": count_tokens(chunk_text),
                            "embedding_model": "models/text-embedding-004",
                            "structured_facts": document_facts | chunk_facts,
                            **unit.metadata,
                        },
                    }
                )

        return chunks

    def _split_unit(self, unit: TextUnit) -> list[str]:
        text = (unit.text or "").strip()
        if not text:
            return []
        if count_tokens(text) <= self.max_tokens:
            return [text]
        return split_tokens(text, self.max_tokens, self.overlap_tokens)


class PageSectionStrategy(ChunkingStrategy):
    """General strategy: page -> heading section -> paragraph -> token window."""

    def build_units(self, context: ChunkingContext) -> list[TextUnit]:
        source_pages = context.document.page_results or []
        if not source_pages:
            return [TextUnit(text=context.document.raw_text, page_number=None, confidence=context.document.confidence_score)]

        units: list[TextUnit] = []
        for page in source_pages:
            for section_title, section_text in split_sections(page.text):
                blocks = split_paragraphs(section_text)
                for merged in merge_small_blocks(blocks, self.target_tokens, self.max_tokens):
                    units.append(
                        TextUnit(
                            text=merged,
                            page_number=page.page_number,
                            section_title=section_title,
                            confidence=page.confidence,
                            metadata={
                                "word_count": page.word_count,
                                "char_count": page.char_count,
                            },
                        )
                    )
        if units:
            return units
        return [TextUnit(text=context.document.raw_text, page_number=None, confidence=context.document.confidence_score)]


class NarrativeDocumentStrategy(PageSectionStrategy):
    """Text-heavy PDFs and document files."""


class FinancialTableStrategy(PageSectionStrategy):
    """Preserves table-like row groups before applying token limits."""

    def build_units(self, context: ChunkingContext) -> list[TextUnit]:
        units: list[TextUnit] = []
        source_pages = context.document.page_results or []
        if not source_pages:
            source_pages = []

        for page in source_pages:
            for section_title, section_text in split_sections(page.text):
                row_groups = group_table_rows(section_text)
                for merged in merge_small_blocks(row_groups, self.target_tokens, self.max_tokens):
                    units.append(
                        TextUnit(
                            text=merged,
                            page_number=page.page_number,
                            section_title=section_title,
                            confidence=page.confidence,
                            metadata={
                                "word_count": page.word_count,
                                "char_count": page.char_count,
                                "table_preserved": True,
                            },
                        )
                    )

        if units:
            return units
        return super().build_units(context)


class BankStatementStrategy(FinancialTableStrategy):
    def __init__(self) -> None:
        super().__init__(max_tokens=550, overlap_tokens=80, target_tokens=350)


class PayStubStrategy(FinancialTableStrategy):
    def __init__(self) -> None:
        super().__init__(max_tokens=450, overlap_tokens=60, target_tokens=300)


class TaxReturnStrategy(FinancialTableStrategy):
    def __init__(self) -> None:
        super().__init__(max_tokens=600, overlap_tokens=80, target_tokens=375)


class AppraisalStrategy(PageSectionStrategy):
    def __init__(self) -> None:
        super().__init__(max_tokens=800, overlap_tokens=120, target_tokens=500)


class IdentityImageStrategy(PageSectionStrategy):
    """Small image/ID documents usually need provenance and facts more than many chunks."""

    def __init__(self) -> None:
        super().__init__(max_tokens=350, overlap_tokens=40, target_tokens=250)


class ChunkingStrategyFactory:
    """Selects the best chunker for the normalized document type."""

    def create(self, document_type: str, document_name: str = "") -> ChunkingStrategy:
        normalized_type = normalize_document_type(document_type, document_name)
        if normalized_type == "bank_statement":
            return BankStatementStrategy()
        if normalized_type == "pay_stub":
            return PayStubStrategy()
        if normalized_type == "tax_return":
            return TaxReturnStrategy()
        if normalized_type == "appraisal":
            return AppraisalStrategy()
        if normalized_type in {"identity_document", "check"}:
            return IdentityImageStrategy()
        if normalized_type == "financial_statement":
            return FinancialTableStrategy(max_tokens=600, overlap_tokens=80, target_tokens=375)
        return NarrativeDocumentStrategy()
