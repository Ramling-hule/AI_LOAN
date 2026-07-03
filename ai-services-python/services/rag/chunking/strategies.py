from __future__ import annotations

import re
import time
from abc import ABC, abstractmethod
from typing import Any, Callable

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

# A body that's only this many characters longer than its own section title
# (e.g. the title plus a trailing colon/dash/whitespace) still counts as a
# "heading echo" rather than real content.
HEADING_ECHO_SLACK_CHARS = 15


class ChunkingStrategy(ABC):
    """Strategy interface for document-type-aware chunking."""

    # merge_small_blocks() only merges blocks WITHIN one (page, section)
    # group — it has no way to see across group boundaries. A merged group
    # under this many tokens is treated as "too small to stand alone" and
    # carried forward to be merged into the NEXT group instead of being
    # emitted as its own low-information chunk (e.g. an isolated letterhead
    # line, or a short OCR text-block that landed in its own page_results
    # entry). Tune per-strategy by overriding on a subclass if needed.
    CARRY_FORWARD_MAX_TOKENS: int = 40

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

        current_time = int(time.time())

        for unit in self.build_units(context):
            for chunk_text in self._split_unit(unit):
                body = chunk_text.strip()
                if len(body) < MIN_CHUNK_CHARS:
                    continue

                # Defense-in-depth: if a chunk's body carries no content
                # beyond its own section title (possible via other code
                # paths even after the carry-forward fix below), don't
                # duplicate the heading into the body, and don't emit a
                # chunk that's just a heading with nothing else in it.
                if self._is_heading_echo(body, unit.section_title):
                    continue

                display_text = body
                if unit.section_title and not self._is_heading_echo(body, unit.section_title):
                    display_text = f"[{unit.section_title}]\n{body}"

                chunk_index = len(chunks)
                chunk_facts = self.fact_extractor.extract(display_text, normalized_type)
                chunks.append(
                    {
                        "application_id": context.application_id,
                        "source_document": context.job_id,
                        "document_type": normalized_type,
                        "document_name": context.document_name,
                        "chunk_index": chunk_index,
                        "page_number": unit.page_number,
                        "chunk_text": display_text,
                        "metadata": {
                            "uploaded_at": current_time,
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

    @staticmethod
    def _is_heading_echo(body: str, section_title: str | None) -> bool:
        """True if `body` carries no real content beyond its own section
        title — i.e. this "chunk" is just a heading, not a passage."""
        if not section_title:
            return False
        normalized_body = " ".join(body.split()).strip().lower()
        normalized_title = " ".join(section_title.split()).strip().lower()
        if not normalized_title:
            return False
        if normalized_body == normalized_title:
            return True
        if normalized_body.startswith(normalized_title) and (
            len(normalized_body) - len(normalized_title) < HEADING_ECHO_SLACK_CHARS
        ):
            return True
        return False

    def _split_unit(self, unit: TextUnit) -> list[str]:
        text = (unit.text or "").strip()
        if not text:
            return []
        if count_tokens(text) <= self.max_tokens:
            return [text]
        return split_tokens(text, self.max_tokens, self.overlap_tokens)

    def _fallback_units(self, context: ChunkingContext) -> list[TextUnit]:
        return [
            TextUnit(
                text=context.document.raw_text,
                page_number=None,
                confidence=context.document.confidence_score,
            )
        ]

    def _build_units_with_carry(
        self,
        source_pages: list,
        block_fn: Callable[[str], list[str]],
        unit_metadata_fn: Callable[[Any], dict],
        block_postprocess_fn: Callable[[list[str]], list[str]] | None = None,
        title_classify_fn: Callable[[str | None], dict] | None = None,
    ) -> list[TextUnit]:
        """Shared per-strategy chunk-assembly loop with carry-forward merging.

        Walks (page, section) groups in order. A group's trailing merged
        block that's below CARRY_FORWARD_MAX_TOKENS is held back and
        prepended to the NEXT group's blocks (across section AND page
        boundaries) before that group is merged, so it gets absorbed into
        real content instead of standing alone forever. Only emitted as its
        own unit if there's genuinely nothing left afterward to merge it
        into (end of document).

        Two optional hooks let subclasses customize behavior without
        re-implementing this loop:

        - block_postprocess_fn(blocks) -> blocks: run after block_fn splits
          a section into blocks but before merging. Used e.g. by
          BankPolicySemanticStrategy to glue "Exception:/Note:/However..."
          blocks onto the preceding block instead of letting them stand
          alone.
        - title_classify_fn(section_title) -> dict: run once per section to
          derive extra per-unit metadata from the section title (and/or
          update strategy-level state such as "current chapter"). Merged
          into each emitted TextUnit's metadata. Used e.g. by
          BankPolicySemanticStrategy to track chapter/section headings.
        """
        units: list[TextUnit] = []
        pending_text: str | None = None
        pending_title: str | None = None
        pending_page = None
        pending_confidence = None
        pending_metadata: dict = {}

        for page in source_pages:
            for section_title, section_text in split_sections(page.text):
                extra_meta = title_classify_fn(section_title) if title_classify_fn else {}

                blocks = list(block_fn(section_text))
                if block_postprocess_fn:
                    blocks = block_postprocess_fn(blocks)

                if pending_text:
                    blocks = [pending_text] + blocks
                    pending_text = None

                merged_blocks = merge_small_blocks(blocks, self.target_tokens, self.max_tokens)
                if not merged_blocks:
                    continue

                *complete_blocks, last_block = merged_blocks
                if count_tokens(last_block) < self.CARRY_FORWARD_MAX_TOKENS:
                    pending_text = last_block
                    pending_title = section_title
                    pending_page = page.page_number
                    pending_confidence = page.confidence
                    pending_metadata = {**unit_metadata_fn(page), **extra_meta}
                    merged_blocks = complete_blocks

                for merged in merged_blocks:
                    units.append(
                        TextUnit(
                            text=merged,
                            page_number=page.page_number,
                            section_title=section_title,
                            confidence=page.confidence,
                            metadata={**unit_metadata_fn(page), **extra_meta},
                        )
                    )

        if pending_text and pending_text.strip():
            units.append(
                TextUnit(
                    text=pending_text,
                    page_number=pending_page,
                    section_title=pending_title,
                    confidence=pending_confidence,
                    metadata=pending_metadata,
                )
            )

        return units


class PageSectionStrategy(ChunkingStrategy):
    """General strategy: page -> heading section -> paragraph -> token window."""

    def build_units(self, context: ChunkingContext) -> list[TextUnit]:
        source_pages = context.document.page_results or []
        if not source_pages:
            return self._fallback_units(context)

        units = self._build_units_with_carry(
            source_pages,
            block_fn=split_paragraphs,
            unit_metadata_fn=lambda page: {
                "word_count": page.word_count,
                "char_count": page.char_count,
            },
        )
        return units if units else self._fallback_units(context)


class NarrativeDocumentStrategy(PageSectionStrategy):
    """Text-heavy PDFs and document files."""


class FinancialTableStrategy(PageSectionStrategy):
    """Preserves table-like row groups before applying token limits."""

    def build_units(self, context: ChunkingContext) -> list[TextUnit]:
        source_pages = context.document.page_results or []
        if not source_pages:
            return super().build_units(context)

        units = self._build_units_with_carry(
            source_pages,
            block_fn=group_table_rows,
            unit_metadata_fn=lambda page: {
                "word_count": page.word_count,
                "char_count": page.char_count,
                "table_preserved": True,
            },
        )
        return units if units else super().build_units(context)


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


class BankPolicySemanticStrategy(ChunkingStrategy):
    """
    Deterministic semantic chunker for Bank Policies without using LLMs.
    Groups text by hierarchy, preserves tables, and glues exceptions to their parent rules.

    Previously this duplicated the entire carry-forward assembly loop from
    ChunkingStrategy._build_units_with_carry (~70 lines) just to add two
    behaviors on top of it: tracking chapter/section headings, and gluing
    "Exception:/Note:/However..." blocks onto the preceding rule block. Both
    now plug into the shared loop via the block_postprocess_fn and
    title_classify_fn hooks instead of re-implementing the loop.
    """

    def __init__(self) -> None:
        super().__init__(max_tokens=800, overlap_tokens=0, target_tokens=500)
        self._current_chapter: str | None = None
        self._current_section: str | None = None

    def _classify_title(self, section_title: str | None) -> dict:
        """Updates running chapter/section state from a section heading and
        returns the metadata to attach to units in that section."""
        if section_title:
            title_lower = section_title.lower()
            first_word = section_title.split()[0] if section_title.split() else ""
            if "chapter" in title_lower or re.match(r"^\d+\.$", first_word):
                self._current_chapter = section_title
                self._current_section = None
            else:
                self._current_section = section_title
        return {"chapter": self._current_chapter, "section": self._current_section}

    @staticmethod
    def _glue_exceptions(blocks: list[str]) -> list[str]:
        """Glue exception/note/caveat blocks onto the preceding rule block
        so they never stand alone or get separated from the rule they
        qualify."""
        glued_blocks: list[str] = []
        for block in blocks:
            block_lower = block.strip().lower()
            is_exception = block_lower.startswith("exception") or block_lower.startswith("note") or block_lower.startswith("however")
            if is_exception and glued_blocks:
                glued_blocks[-1] += "\n\n" + block
            else:
                glued_blocks.append(block)
        return glued_blocks

    def build_units(self, context: ChunkingContext) -> list[TextUnit]:
        source_pages = context.document.page_results or []
        if not source_pages:
            return self._fallback_units(context)

        # Reset per-call state — a strategy instance could in principle be
        # reused across documents (the factory currently creates a fresh
        # one each time, but don't rely on that).
        self._current_chapter = None
        self._current_section = None

        units = self._build_units_with_carry(
            source_pages,
            block_fn=group_table_rows,
            unit_metadata_fn=lambda page: {"word_count": page.word_count, "char_count": page.char_count},
            block_postprocess_fn=self._glue_exceptions,
            title_classify_fn=self._classify_title,
        )

        if units:
            return units

        # BUG FIX (preserved from original): this used to be
        # `return super().build_units(context)`. BankPolicySemanticStrategy's
        # parent is ChunkingStrategy directly — an ABSTRACT class whose
        # build_units has no real body, just a docstring. Calling it via
        # super() doesn't raise; it silently returns None, which then
        # crashes create_chunks()'s `for unit in self.build_units(context):`
        # with a TypeError the first time a bank policy produces zero units
        # (e.g. an empty/unparseable policy document).
        return self._fallback_units(context)


class ChunkingStrategyFactory:
    """Selects the best chunker for the normalized document type."""

    def create(self, document_type: str, document_name: str = "") -> ChunkingStrategy:
        normalized_type = normalize_document_type(document_type, document_name)
        if normalized_type == "bank_policy":
            return BankPolicySemanticStrategy()
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