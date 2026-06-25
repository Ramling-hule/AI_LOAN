import io
import time
from loguru import logger
import pdfplumber
from .base import DocumentExtractor, DocumentResult, PageResult
from config.settings import get_settings

settings = get_settings()
MIN_NATIVE_TEXT_DENSITY = 50

class PdfPlumberExtractor(DocumentExtractor):
    def __init__(self, fallback_extractor: DocumentExtractor = None):
        self.fallback_extractor = fallback_extractor

    async def extract(self, file_bytes: bytes, filename: str) -> DocumentResult:
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
                native_chars += len(text)
                all_texts.append(text)
                
                tables = page.extract_tables()
                for tbl in (tables or []):
                    if tbl and len(tbl) > 1:
                        headers = [str(c) if c else "" for c in tbl[0]]
                        rows = [{"row_index": i, "cells": [str(c) if c else "" for c in row]} for i, row in enumerate(tbl[1:])]
                        all_tables.append({"page": page_num, "headers": headers, "rows": rows, "confidence": 95.0})
                
                page_results.append(PageResult(
                    page_number=page_num,
                    text=text,
                    word_count=len(text.split()),
                    char_count=len(text),
                    processing_time_ms=int((time.time() - page_start) * 1000),
                    confidence=90.0 if text.strip() else 0.0,
                ))
        
        avg_chars_per_page = native_chars / result.page_count if result.page_count else 0
        
        if avg_chars_per_page >= MIN_NATIVE_TEXT_DENSITY:
            result.pdf_type = "native"
            result.raw_text = "\n\n".join(all_texts)
            result.tables = all_tables
            result.page_results = page_results
            result.word_count = len(result.raw_text.split())
            result.char_count = len(result.raw_text)
            result.confidence_score = 90.0
            logger.info(f"[PdfExtractor] Native PDF detected. Avg chars/page: {avg_chars_per_page:.0f}")
            return result
        elif self.fallback_extractor:
            logger.info(f"[PdfExtractor] Scanned PDF detected. Delegating to fallback...")
            fallback_result = await self.fallback_extractor.extract(file_bytes, filename)
            fallback_result.pdf_type = "scanned"
            fallback_result.page_count = result.page_count
            return fallback_result
        else:
            return result
