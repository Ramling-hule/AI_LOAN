"""
OCR async queue — processes OCR jobs one at a time (or in small batches).
Replaces the Node.js Bull/in-memory ocrQueue.js.

After OCR completes, runs the vectorization pipeline:
  1. Chunk the extracted text
  2. Embed chunks using Azure OpenAI text-embedding-3-small
  3. Store embeddings in PostgreSQL pgvector

Then calls back to the backend to mark the OCR job as vectorized.
"""
import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from loguru import logger
from typing import Optional
import httpx

from config.settings import get_settings
from config.database import execute, fetchrow
from services.ocr.document_loader import process_document, DocumentResult
from services.llm.llm_facade import embed_batch
from services.vectordb.pgvector_service import upsert_document_chunks
from services.rag.chunking.service import build_document_chunks

settings = get_settings()

_queue: asyncio.Queue = asyncio.Queue(maxsize=settings.OCR_MAX_QUEUE_SIZE)
_worker_task: Optional[asyncio.Task] = None


_active_jobs: dict[str, dict] = {}




@dataclass
class OcrQueueItem:
    job_id: str
    file_bytes: bytes
    filename: str
    mime_type: str
    application_id: str
    document_type: str
    document_url: str = ""




async def submit_job(item: OcrQueueItem) -> bool:
    """Add an OCR job to the processing queue."""
    _active_jobs[item.job_id] = {"status": "queued", "submitted_at": time.time()}
    try:
        _queue.put_nowait(item)
        logger.info(f"[OCR Queue] Job {item.job_id} queued. Queue size: {_queue.qsize()}")
        return True
    except asyncio.QueueFull:
        logger.error(f"[OCR Queue] Queue full! Job {item.job_id} rejected.")
        _active_jobs[item.job_id]["status"] = "rejected"
        return False


def get_job_state(job_id: str) -> dict | None:
    return _active_jobs.get(job_id)




async def start_worker():
    """Start the background OCR queue worker. Called on app startup."""
    global _worker_task
    _worker_task = asyncio.create_task(_worker_loop())
    logger.info("[OCR Queue] Worker started")


async def stop_worker():
    global _worker_task
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    logger.info("[OCR Queue] Worker stopped")


async def _worker_loop():
    """Continuously process jobs from the queue."""
    logger.info("[OCR Queue] Worker loop running...")
    while True:
        try:
            item: OcrQueueItem = await _queue.get()
            await _process_job(item)
            _queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[OCR Queue] Unhandled worker error: {e}")
            await asyncio.sleep(1)


async def _process_job(item: OcrQueueItem):
    """Full OCR + vectorization pipeline for a single job."""
    job_id = item.job_id
    logger.info(f"[OCR Queue] Processing job {job_id} — file: {item.filename}")

    _active_jobs[job_id] = {"status": "processing", "started_at": time.time()}

    
    await execute(
        "UPDATE ocr_jobs SET status = 'processing', started_at = NOW() WHERE id = $1",
        job_id
    )

    start = time.time()
    doc_result: DocumentResult | None = None

    try:
        
        doc_result = await process_document(item.file_bytes, item.filename, item.mime_type)

        if not doc_result.raw_text.strip():
            raise ValueError("OCR produced empty text output — document may be corrupt or unsupported.")

        processing_ms = int((time.time() - start) * 1000)

        
        ocr_result_json = {
            "raw_text": doc_result.raw_text,
            "tables": doc_result.tables,
            "page_results": [
                {
                    "page_number": pr.page_number,
                    "text": pr.text,
                    "confidence": pr.confidence,
                    "word_count": pr.word_count,
                    "char_count": pr.char_count,
                    "processing_time_ms": pr.processing_time_ms,
                }
                for pr in doc_result.page_results
            ],
            "confidence_score": doc_result.confidence_score,
            "word_count": doc_result.word_count,
            "char_count": doc_result.char_count,
            "language_detected": doc_result.language_detected,
        }

        await execute(
            """
            UPDATE ocr_jobs SET
                status = 'completed',
                page_count = $2,
                pdf_type = $3,
                ocr_result = $4::jsonb,
                processing_time_ms = $5,
                completed_at = NOW()
            WHERE id = $1
            """,
            job_id, doc_result.page_count, doc_result.pdf_type,
            json.dumps(ocr_result_json), processing_ms,
        )

        logger.info(f"[OCR Queue] Job {job_id} OCR complete in {processing_ms}ms. Running vectorization...")

        
        job_record = await fetchrow("SELECT is_vectorized, vector_chunk_count FROM ocr_jobs WHERE id = $1", job_id)
        is_vectorized = job_record["is_vectorized"] if job_record else False
        
        if is_vectorized:
            logger.info(f"[OCR Queue] Job {job_id} already vectorized. Skipping new embeddings as requested.")
            chunk_count = job_record.get("vector_chunk_count", 0)
        else:
            chunks = build_document_chunks(
                document=doc_result,
                job_id=job_id,
                application_id=item.application_id,
                document_type=item.document_type,
                document_name=item.filename,
                mime_type=item.mime_type,
            )

            if chunks:
                chunk_texts = [c["chunk_text"] for c in chunks]
                embeddings = []
                batch_size = 20
                for i in range(0, len(chunk_texts), batch_size):
                    batch = chunk_texts[i:i+batch_size]
                    logger.info(f"[OCR Queue] Embedding batch {i//batch_size + 1}/{(len(chunk_texts)-1)//batch_size + 1}")
                    batch_embs = await embed_batch(batch, use_last_key=False)
                    embeddings.extend(batch_embs)
                    if i + batch_size < len(chunk_texts):
                        logger.info(f"[OCR Queue] Waiting 60s before next embedding batch...")
                        await asyncio.sleep(60)

                for chunk, embedding in zip(chunks, embeddings):
                    chunk["embedding"] = embedding

                chunk_count = await upsert_document_chunks(chunks)
            else:
                chunk_count = 0
                logger.warning(f"[OCR Queue] Job {job_id} produced no chunks to vectorize.")

        
        await execute(
            """
            UPDATE ocr_jobs SET
                is_vectorized = TRUE,
                vectorized_at = NOW(),
                vector_chunk_count = $2,
                vectorization_error = NULL,
                ocr_result = NULL
            WHERE id = $1
            """,
            job_id, chunk_count,
        )

        _active_jobs[job_id] = {
            "status": "completed",
            "chunk_count": chunk_count,
            "confidence": doc_result.confidence_score,
        }

        
        await _notify_backend_vectorized(job_id, chunk_count, success=True)

        logger.info(f"[OCR Queue] Job {job_id} complete: {chunk_count} chunks vectorized.")

    except Exception as e:
        logger.error(f"[OCR Queue] Job {job_id} FAILED: {e}")
        _active_jobs[job_id] = {"status": "failed", "error": str(e)}

        error_info = {"message": str(e), "step": "ocr_or_vectorization"}
        await execute(
            """
            UPDATE ocr_jobs SET
                status = 'failed',
                error_info = $2::jsonb,
                processing_time_ms = $3,
                completed_at = NOW()
            WHERE id = $1
            """,
            job_id, json.dumps(error_info), int((time.time() - start) * 1000),
        )
        await _notify_backend_vectorized(job_id, 0, success=False, error=str(e))





async def _notify_backend_vectorized(job_id: str, chunk_count: int, success: bool, error: str = ""):
    """PATCH callback to the backend to update OCR job vectorization status."""
    try:
        payload = {
            "success": success,
            "chunk_count": chunk_count,
            "vectorized_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": error,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{settings.BACKEND_URL}/api/v1/ocr/jobs/{job_id}/vectorized",
                json=payload,
                headers={"x-internal-secret": settings.BACKEND_CALLBACK_SECRET},
            )
    except Exception as e:
        logger.warning(f"[OCR Queue] Backend callback failed for job {job_id}: {e}")
