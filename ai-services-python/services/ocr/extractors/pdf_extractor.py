import asyncio
import io
import time
from loguru import logger
import pdfplumber
from .base import DocumentExtractor, DocumentResult, PageResult
from config.settings import get_settings

settings = get_settings()
MIN_NATIVE_TEXT_DENSITY = 50

# Characters expected on a "good" native page.
# A dense page of body text is roughly 2000–3000 chars; we treat 2000 as the
# ceiling where confidence maxes out at ~98 %.  Below that it scales linearly
# down, with a floor of 10 % so we never report 0 % for a near-blank page
# that still had some text (headers, page numbers, etc.).
_FULL_PAGE_CHARS = 2000
_CONFIDENCE_FLOOR = 10.0
_CONFIDENCE_CEIL  = 98.0


def _page_confidence(char_count: int) -> float:
    """
    Density-based confidence for a native-PDF page.

    Logic:
    - Pages with 0 chars → 0.0 (truly blank / extraction failed)
    - Pages with ≥ _FULL_PAGE_CHARS → _CONFIDENCE_CEIL
    - Pages in between → linear interpolation between _CONFIDENCE_FLOOR and _CONFIDENCE_CEIL
    """
    if char_count == 0:
        return 0.0
    ratio = min(char_count / _FULL_PAGE_CHARS, 1.0)
    return round(_CONFIDENCE_FLOOR + ratio * (_CONFIDENCE_CEIL - _CONFIDENCE_FLOOR), 2)


class PdfPlumberExtractor(DocumentExtractor):
    def __init__(self, fallback_extractor: DocumentExtractor = None):
        self.fallback_extractor = fallback_extractor

    async def extract(self, file_bytes: bytes, filename: str) -> DocumentResult:
        """
        Public async entrypoint. pdfplumber's page.extract_text() /
        extract_tables() are synchronous and CPU-bound — calling them
        directly inside this coroutine would block the entire event loop
        for the full duration of parsing (multi-second on dense multi-page
        PDFs), stalling every other concurrent request in the process
        (other OCR jobs, API calls, embedding calls, everything).

        The fix: do the actual pdfplumber work in a worker thread via
        asyncio.to_thread, and keep this coroutine free to only await.
        """
        result = await asyncio.to_thread(self._extract_sync, file_bytes)

        if result.pdf_type == "native":
            return result

        if self.fallback_extractor:
            logger.info("[PdfExtractor] Scanned PDF detected. Delegating to fallback...")
            fallback_result = await self.fallback_extractor.extract(file_bytes, filename)
            fallback_result.pdf_type = "scanned"
            fallback_result.page_count = result.page_count
            return fallback_result

        return result

    def _extract_sync(self, file_bytes: bytes) -> DocumentResult:
        """
        Synchronous pdfplumber parse. Runs inside a worker thread (see
        `extract` above) — never call this directly from the event loop.

        Returns a DocumentResult with pdf_type set to "native" if the text
        density check passes, or the raw (empty-ish) result with pdf_type
        left at its default otherwise, so the caller knows whether to fall
        back to OCR.
        """
        result = DocumentResult()

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            result.page_count = len(pdf.pages)
            native_chars = 0
            all_texts = []
            all_tables = []
            page_results = []

            for page_num, page in enumerate(pdf.pages, 1):
                page_start = time.time()
                text = page.extract_text() or ""

                tables = page.extract_tables()
                md_tables_text = ""
                for tbl in (tables or []):
                    if tbl and len(tbl) > 1:
                        headers = [str(c).replace('\n', ' ') if c else "" for c in tbl[0]]
                        rows = [{"row_index": i, "cells": [str(c).replace('\n', ' ') if c else "" for c in row]} for i, row in enumerate(tbl[1:])]
                        all_tables.append({"page": page_num, "headers": headers, "rows": rows, "confidence": 95.0})

                        # Generate Markdown table
                        if headers:
                            md_tables_text += f"\n\n*[Table extracted from Page {page_num}]*\n\n"
                            md_tables_text += "| " + " | ".join(headers) + " |\n"
                            md_tables_text += "| " + " | ".join(["---"] * len(headers)) + " |\n"
                            for row in rows:
                                md_tables_text += "| " + " | ".join(row["cells"]) + " |\n"

                if md_tables_text:
                    text += md_tables_text

                char_count = len(text)
                native_chars += char_count
                all_texts.append(text)

                page_conf = _page_confidence(char_count)
                page_results.append(PageResult(
                    page_number=page_num,
                    text=text,
                    word_count=len(text.split()),
                    char_count=char_count,
                    processing_time_ms=int((time.time() - page_start) * 1000),
                    confidence=page_conf,
                ))

        avg_chars_per_page = native_chars / result.page_count if result.page_count else 0

        if avg_chars_per_page >= MIN_NATIVE_TEXT_DENSITY:
            result.pdf_type = "native"
            result.raw_text = "\n\n".join(all_texts)
            result.tables = all_tables
            result.page_results = page_results
            result.word_count = len(result.raw_text.split())
            result.char_count = len(result.raw_text)

            # Document-level confidence: weighted average by char_count so that
            # content-rich pages dominate sparse/blank ones.
            total_weight = sum(p.char_count for p in page_results)
            if total_weight > 0:
                doc_confidence = round(
                    sum(p.confidence * p.char_count for p in page_results) / total_weight, 2
                )
            else:
                doc_confidence = round(_page_confidence(int(avg_chars_per_page)), 2)

            result.confidence_score = doc_confidence
            logger.info(
                f"[PdfExtractor] Native PDF detected. "
                f"Avg chars/page: {avg_chars_per_page:.0f}, "
                f"Doc confidence: {doc_confidence:.2f}%"
            )
            return result

        # Not native — leave pdf_type at its default ("unknown"), signalling
        # to the async wrapper above that it should try the OCR fallback.
        return result