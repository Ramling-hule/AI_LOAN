from pathlib import Path
from loguru import logger
from .base import DocumentExtractor, DocumentResult

try:
    from unstructured.partition.pdf import partition_pdf
    UNSTRUCTURED_AVAILABLE = True
except ImportError:
    UNSTRUCTURED_AVAILABLE = False
    logger.warning("unstructured not available — fallback will return empty results")

class UnstructuredFallbackExtractor(DocumentExtractor):
    async def extract(self, file_bytes: bytes, filename: str) -> DocumentResult:
        result = DocumentResult(page_count=1, pdf_type="unknown")
        if not UNSTRUCTURED_AVAILABLE:
            return result
            
        try:
            import tempfile, os
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name
                
            elements = partition_pdf(filename=tmp_path, strategy="auto")
            text_parts = [str(el) for el in elements]
            result.raw_text = "\n".join(text_parts)
            result.word_count = len(result.raw_text.split())
            result.char_count = len(result.raw_text)
            result.confidence_score = 85.0
            os.unlink(tmp_path)
        except Exception as e:
            logger.error(f"[UnstructuredExtractor] fallback failed: {e}")
            
        return result
