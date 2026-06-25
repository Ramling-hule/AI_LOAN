import time
from pathlib import Path
from loguru import logger

from .extractors.base import DocumentResult
from .extractors.pdf_extractor import PdfPlumberExtractor
from .extractors.image_extractor import PaddleOcrExtractor, ScannedPdfOcrExtractor
from .extractors.unstructured_extractor import UnstructuredFallbackExtractor

async def process_document(file_bytes: bytes, filename: str, mime_type: str) -> DocumentResult:
    """
    Main entry point for document processing.
    Delegates to appropriate extractors based on file type.
    """
    start = time.time()
    ext = Path(filename).suffix.lower()

    if mime_type.startswith("image/") or ext in [".png", ".jpg", ".jpeg", ".tiff", ".bmp"]:
        extractor = PaddleOcrExtractor()
        result = await extractor.extract(file_bytes, filename)
        result.pdf_type = "image"
    elif mime_type == "application/pdf" or ext == ".pdf":
        fallback = ScannedPdfOcrExtractor()
        extractor = PdfPlumberExtractor(fallback_extractor=fallback)
        result = await extractor.extract(file_bytes, filename)
    else:
        extractor = UnstructuredFallbackExtractor()
        result = await extractor.extract(file_bytes, filename)
        result.pdf_type = "unknown"

    result.processing_time_ms = int((time.time() - start) * 1000)
    logger.info(
        f"[DocLoader] Processed '{filename}' — type={result.pdf_type}, "
        f"pages={result.page_count}, chars={result.char_count}, "
        f"confidence={result.confidence_score:.2f}, time={result.processing_time_ms}ms"
    )
    return result
