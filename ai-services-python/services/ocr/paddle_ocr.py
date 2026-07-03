"""
PaddleOCR engine wrapper.

PaddleOCR advantages:
  - Much higher accuracy on Indian financial documents
  - Built-in layout detection (text, table, figure regions)
  - Table structure recognition
  - Multi-language support (English + Hindi)
  - PP-StructureV2 for complex document understanding

CONCURRENCY NOTE
-----------------
Previously this module held ONE global PaddleOCR engine guarded by ONE
global asyncio.Lock. That meant every OCR call in the entire process —
across every document, every application, every worker — ran strictly
one-at-a-time. A single 50-page scanned bank statement would fully
serialize its own 50 pages AND block every other document's OCR from
even starting until it finished.

If PaddleOCR engine instances aren't safe to share across concurrent
`.ocr()` calls (they're generally not, due to internal mutable state),
the correct fix isn't a lock around one shared instance — it's a small
POOL of independent engine instances behind a semaphore sized to your
actual hardware capacity (GPU slots, or CPU cores if running on CPU).
This lets N pages OCR truly concurrently instead of 1.
"""
import io
import asyncio
import itertools
from loguru import logger
import numpy as np
from PIL import Image
from config.settings import get_settings

settings = get_settings()


_ocr_engines: list = []
_ocr_queue: asyncio.Queue | None = None
_init_lock = asyncio.Lock()


def _create_engine():
    from paddleocr import PaddleOCR
    return PaddleOCR(
        use_angle_cls=True,
        lang=settings.OCR_LANGUAGE,
        use_gpu=settings.OCR_USE_GPU,
        show_log=False,
        ocr_version="PP-OCRv4",
    )


async def _ensure_pool():
    """
    Lazily initialize the engine pool on first use. Pool size comes from
    settings.OCR_POOL_SIZE (add this to config/settings.py — recommended
    default: number of GPU slots if OCR_USE_GPU, otherwise a small number
    of CPU cores, e.g. 2-4). Falls back to 2 if the setting isn't present
    so this doesn't hard-crash on an unmigrated settings module.
    """
    global _ocr_engines, _ocr_queue

    if _ocr_queue:
        return

    async with _init_lock:
        if _ocr_queue:
            return

        pool_size = getattr(settings, "OCR_POOL_SIZE", 2)
        try:
            _ocr_engines = await asyncio.get_event_loop().run_in_executor(
                None, lambda: [_create_engine() for _ in range(pool_size)]
            )
            _ocr_queue = asyncio.Queue()
            for engine in _ocr_engines:
                _ocr_queue.put_nowait(engine)

            logger.info(
                f"✅  PaddleOCR pool initialized (lang={settings.OCR_LANGUAGE}, "
                f"gpu={settings.OCR_USE_GPU}, pool_size={pool_size})"
            )
        except ImportError:
            logger.error("❌ PaddleOCR is not installed.")
            raise
        except Exception as e:
            logger.error(f"❌ PaddleOCR pool initialization failed: {e}")
            raise


async def run_paddle_ocr_on_image(img_bytes: bytes) -> tuple[str, float]:
    """
    Run PaddleOCR on a single image (as bytes).
    Returns (extracted_text, confidence_score).

    Uses an asyncio.Queue to ensure each PaddleOCR engine is exclusively
    held by one task at a time, preventing concurrency crashes.
    """
    await _ensure_pool()

    engine = await _ocr_queue.get()
    try:
        return await asyncio.get_event_loop().run_in_executor(
            None, _run_ocr_sync, engine, img_bytes
        )
    finally:
        _ocr_queue.put_nowait(engine)
        _ocr_queue.task_done()


def _run_ocr_sync(engine, img_bytes: bytes) -> tuple[str, float]:
    """Synchronous OCR execution (run in thread pool to avoid blocking event loop)."""
    try:
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