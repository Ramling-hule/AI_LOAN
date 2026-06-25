import io
import time
from loguru import logger
from PIL import Image, ImageEnhance, ImageFilter
from .base import DocumentExtractor, DocumentResult, PageResult
from services.ocr.paddle_ocr import run_paddle_ocr_on_image
from config.settings import get_settings

settings = get_settings()

class ImageEnhancer:
    @staticmethod
    def enhance(img_bytes: bytes) -> bytes:
        try:
            img = Image.open(io.BytesIO(img_bytes)).convert("L")
            img = ImageEnhance.Contrast(img).enhance(1.5)
            img = img.filter(ImageFilter.SHARPEN)
            out = io.BytesIO()
            img.save(out, format="PNG")
            return out.getvalue()
        except Exception as e:
            logger.warning(f"[ImageEnhancer] Enhancement failed: {e}")
            return img_bytes

class PaddleOcrExtractor(DocumentExtractor):
    async def extract(self, file_bytes: bytes, filename: str) -> DocumentResult:
        result = DocumentResult(page_count=1)
        
        if settings.ENABLE_IMAGE_ENHANCEMENT:
            file_bytes = ImageEnhancer.enhance(file_bytes)
            
        ocr_text, confidence = await run_paddle_ocr_on_image(file_bytes)
        
        result.raw_text = ocr_text
        result.confidence_score = confidence
        result.word_count = len(ocr_text.split())
        result.char_count = len(ocr_text)
        result.page_results = [PageResult(
            page_number=1, text=ocr_text, confidence=confidence,
            word_count=result.word_count, char_count=result.char_count,
        )]
        return result

class ScannedPdfOcrExtractor(DocumentExtractor):
    async def extract(self, file_bytes: bytes, filename: str) -> DocumentResult:
        from pdf2image import convert_from_bytes
        result = DocumentResult(pdf_type="scanned")
        
        try:
            images = convert_from_bytes(file_bytes, dpi=settings.PDF_DPI, fmt="PNG")
            result.page_count = len(images)
        except Exception as e:
            logger.error(f"[ScannedPdfOcrExtractor] PDF→image conversion failed: {e}")
            return result
            
        all_texts = []
        all_confidences = []
        page_results = []
        
        for idx, pil_image in enumerate(images, 1):
            page_start = time.time()
            buf = io.BytesIO()
            pil_image.save(buf, format="PNG")
            img_bytes = buf.getvalue()
            
            if settings.ENABLE_IMAGE_ENHANCEMENT:
                img_bytes = ImageEnhancer.enhance(img_bytes)
                
            ocr_text, confidence = await run_paddle_ocr_on_image(img_bytes)
            all_texts.append(ocr_text)
            all_confidences.append(confidence)
            
            page_results.append(PageResult(
                page_number=idx,
                text=ocr_text,
                confidence=confidence,
                word_count=len(ocr_text.split()),
                char_count=len(ocr_text),
                processing_time_ms=int((time.time() - page_start) * 1000),
            ))
            
        result.raw_text = "\n\n".join(all_texts)
        result.page_results = page_results
        result.word_count = len(result.raw_text.split())
        result.char_count = len(result.raw_text)
        result.confidence_score = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
        return result
