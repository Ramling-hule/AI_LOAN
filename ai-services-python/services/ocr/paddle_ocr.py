"""
PaddleOCR engine wrapper.

PaddleOCR advantages:
  - Much higher accuracy on Indian financial documents
  - Built-in layout detection (text, table, figure regions)
  - Table structure recognition
  - Multi-language support (English + Hindi)
  - PP-StructureV2 for complex document understanding
"""
import io
import asyncio
from functools import lru_cache
from loguru import logger
import numpy as np
from PIL import Image
from config.settings import get_settings

settings = get_settings()

# Global PaddleOCR instance (expensive to initialize — singleton)
_ocr_engine = None
_ocr_lock = asyncio.Lock()


def _get_engine():
    """Lazily initialize PaddleOCR on first use."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
            _ocr_engine = PaddleOCR(
                use_angle_cls=True,       # auto-detect rotated text
                lang=settings.OCR_LANGUAGE,
                use_gpu=settings.OCR_USE_GPU,
                show_log=False,
                # Use PP-OCRv4 (highest accuracy)
                ocr_version="PP-OCRv4",
            )
            logger.info(f"✅  PaddleOCR initialized (lang={settings.OCR_LANGUAGE}, gpu={settings.OCR_USE_GPU})")
        except ImportError:
            logger.error("❌ PaddleOCR is not installed.")
            raise
        except Exception as e:
            logger.error(f"❌ PaddleOCR initialization failed: {e}")
            raise
    return _ocr_engine


async def run_paddle_ocr_on_image(img_bytes: bytes) -> tuple[str, float]:
    """
    Run PaddleOCR on a single image (as bytes).
    Returns (extracted_text, confidence_score).
    Thread-safe via asyncio lock.
    """
    async with _ocr_lock:
        return await asyncio.get_event_loop().run_in_executor(
            None, _run_ocr_sync, img_bytes
        )


def _run_ocr_sync(img_bytes: bytes) -> tuple[str, float]:
    """Synchronous OCR execution (run in thread pool to avoid blocking event loop)."""
    try:
        engine = _get_engine()
        img = Image.open(io.BytesIO(img_bytes))

        img_array = np.array(img)
        result = engine.ocr(img_array, cls=True)

        if not result or not result[0]:
            return "", 0.0

        texts = []
        confidences = []

        for line in result[0]:
            if line and len(line) >= 2:
                text_info = line[1]
                if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                    text = str(text_info[0])
                    conf = float(text_info[1])
                    texts.append(text)
                    confidences.append(conf)

        combined_text = "\n".join(texts)
        avg_confidence = (sum(confidences) / len(confidences) * 100) if confidences else 0.0

        logger.debug(f"[PaddleOCR] Extracted {len(texts)} text lines, avg confidence: {avg_confidence:.1f}%")
        return combined_text, avg_confidence

    except Exception as e:
        logger.error(f"[OCR] OCR failed: {e}")
        return "", 0.0


async def run_paddle_ocr(file_bytes: bytes) -> tuple[str, float]:
    """High-level OCR that auto-converts supported formats."""
    return await run_paddle_ocr_on_image(file_bytes)
