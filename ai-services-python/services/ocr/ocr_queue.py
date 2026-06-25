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
from services.llm.azure_openai import embed_batch
from services.vectordb.pgvector_service import upsert_document_chunks

settings = get_settings()

_queue: asyncio.Queue = asyncio.Queue(maxsize=settings.OCR_MAX_QUEUE_SIZE)
_worker_task: Optional[asyncio.Task] = None

# ── In-memory job tracking (mirrors the PostgreSQL ocr_jobs state) ─────────────
_active_jobs: dict[str, dict] = {}

CHUNK_SIZE = 600      # characters per chunk
CHUNK_OVERLAP = 100   # overlap for context continuity


@dataclass
class OcrQueueItem:
    job_id: str
    file_bytes: bytes
    filename: str
    mime_type: str
    application_id: str
    document_type: str
    document_url: str = ""


# ── Queue API ─────────────────────────────────────────────────────────────────

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


# ── Worker ────────────────────────────────────────────────────────────────────

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

    # Update PostgreSQL job status to 'processing'
    await execute(
        "UPDATE ocr_jobs SET status = 'processing', started_at = NOW() WHERE id = $1",
        job_id
    )

    start = time.time()
    doc_result: DocumentResult | None = None

    try:
        # Step 1: OCR / Document extraction
        doc_result = await process_document(item.file_bytes, item.filename, item.mime_type)

        if not doc_result.raw_text.strip():
            raise ValueError("OCR produced empty text output — document may be corrupt or unsupported.")

        processing_ms = int((time.time() - start) * 1000)

        # Step 2: Persist OCR result to PostgreSQL
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

        # Step 3: Chunk, embed, and store in pgvector
        chunks = _chunk_text(
            text=doc_result.raw_text,
            job_id=job_id,
            application_id=item.application_id,
            document_type=item.document_type,
            document_name=item.filename,
        )

        if chunks:
            chunk_texts = [c["chunk_text"] for c in chunks]
            embeddings = await embed_batch(chunk_texts)

            for chunk, embedding in zip(chunks, embeddings):
                chunk["embedding"] = embedding

            chunk_count = await upsert_document_chunks(chunks)
        else:
            chunk_count = 0
            logger.warning(f"[OCR Queue] Job {job_id} produced no chunks to vectorize.")

        # Step 4: Mark as vectorized in PostgreSQL
        await execute(
            """
            UPDATE ocr_jobs SET
                is_vectorized = TRUE,
                vectorized_at = NOW(),
                vector_chunk_count = $2,
                vectorization_error = NULL
            WHERE id = $1
            """,
            job_id, chunk_count,
        )

        _active_jobs[job_id] = {
            "status": "completed",
            "chunk_count": chunk_count,
            "confidence": doc_result.confidence_score,
        }

        # Step 5: Callback to backend
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


def _chunk_text(text: str, job_id: str, application_id: str, document_type: str, document_name: str) -> list[dict]:
    """
    Split document text into overlapping chunks for embedding.
    Replaces the Node.js chunking logic in the vectorization pipeline.
    """
    chunks = []
    idx = 0
    chunk_index = 0

    while idx < len(text):
        end = min(idx + CHUNK_SIZE, len(text))
        chunk_text = text[idx:end].strip()

        if len(chunk_text) >= 30:  # skip tiny fragments
            chunks.append({
                "application_id": application_id,
                "source_document": job_id,
                "document_type": document_type,
                "document_name": document_name,
                "chunk_index": chunk_index,
                "page_number": None,  # page-level attribution handled separately
                "chunk_text": chunk_text,
                "metadata": {
                    "job_id": job_id,
                    "chunk_index": chunk_index,
                    "document_type": document_type,
                },
            })
            chunk_index += 1

        idx += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


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
