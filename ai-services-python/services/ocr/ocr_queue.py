"""
OCR async queue — processes OCR jobs concurrently across a small worker pool.
Replaces the Node.js Bull/in-memory ocrQueue.js.

After OCR completes, runs the vectorization pipeline:
  1. Chunk the extracted text
  2. Embed chunks using Azure OpenAI text-embedding-3-small
  3. Store embeddings in PostgreSQL pgvector

Then calls back to the backend to mark the OCR job as vectorized.

CONCURRENCY NOTE
-----------------
Previously this ran exactly ONE worker task pulling from the queue, so
jobs were fully serialized — while one document's OCR + vectorization was
running, every other queued document just waited, even though the
underlying OCR pool (see services/ocr/paddle_ocr.py) now supports
genuine parallelism. This module now starts a small pool of worker tasks
(size from settings.OCR_QUEUE_WORKERS) so multiple jobs progress at once.
The queue itself is still a single asyncio.Queue — workers just compete
for items off of it, same as any standard worker-pool pattern.
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
_worker_tasks: list[asyncio.Task] = []


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
    extract_only: bool = False


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
    """
    Start the background OCR queue worker pool. Called on app startup.

    Pool size comes from settings.OCR_QUEUE_WORKERS — add this to
    config/settings.py. Recommended default: 3-4. This should be sized
    with paddle_ocr.py's OCR_POOL_SIZE in mind (queue workers can exceed
    the OCR pool size fine, since I/O-bound steps like embedding and DB
    writes will naturally interleave while the OCR semaphore gates the
    CPU/GPU-bound step), but there's little benefit to a queue worker
    count that wildly exceeds OCR_POOL_SIZE + a small buffer.
    """
    global _worker_tasks
    pool_size = getattr(settings, "OCR_QUEUE_WORKERS", 3)
    _worker_tasks = [asyncio.create_task(_worker_loop(worker_id=i)) for i in range(pool_size)]
    logger.info(f"[OCR Queue] Worker pool started ({pool_size} workers)")


async def stop_worker():
    global _worker_tasks
    for task in _worker_tasks:
        task.cancel()
    for task in _worker_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    _worker_tasks = []
    logger.info("[OCR Queue] Worker pool stopped")


async def _worker_loop(worker_id: int = 0):
    """Continuously process jobs from the shared queue."""
    logger.info(f"[OCR Queue] Worker {worker_id} running...")
    while True:
        try:
            item: OcrQueueItem = await _queue.get()
            await _process_job(item, worker_id)
            _queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            # We log as warning instead of error because the loop intentionally sleeps and auto-recovers.
            logger.warning(f"[OCR Queue] Worker {worker_id} unhandled error (auto-retrying): {e}")
            await asyncio.sleep(1)


async def _process_job(item: OcrQueueItem, worker_id: int = 0):
    """Full OCR + vectorization pipeline for a single job."""
    job_id = item.job_id
    logger.info(f"[OCR Queue] Worker {worker_id} processing job {job_id} — file: {item.filename}")

    _active_jobs[job_id] = {"status": "processing", "started_at": time.time()}

    await execute(
        "UPDATE ocr_jobs SET status = 'processing', started_at = NOW() WHERE id = $1",
        job_id
    )

    start = time.time()
    doc_result: DocumentResult | None = None
    bank_id: str | None = None

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

        if item.extract_only:
            logger.info(f"[OCR Queue] Job {job_id} explicitly marked as extract_only. Skipping vectorization.")
            chunk_count = job_record.get("vector_chunk_count", 0) if job_record else 0
        elif is_vectorized:
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
                chunk_count = await _embed_and_store_chunks(job_id, chunks)
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

        # --- Extract and store rules if it's a bank policy using original rule extraction ---
        if item.document_type == "bank_policy":
            try:
                from services.underwriting.policy_service import policy_service
                logger.info(f"[OCR Queue] Policy detected. Extracting underwriting rules for {item.application_id}...")

                bank_id = item.application_id.replace("BANK_", "") if item.application_id.startswith("BANK_") else item.application_id

                formatted_policy_text = ""
                if doc_result.page_results:
                    for page in doc_result.page_results:
                        formatted_policy_text += f"\n\n--- PAGE {page.page_number} ---\n{page.text}"
                else:
                    formatted_policy_text = doc_result.raw_text

                extraction_result = await policy_service.process_policy(
                    bank_id=bank_id,
                    version="v1",
                    policy_text=formatted_policy_text
                )

                await _notify_backend_rules_extracted(job_id, bank_id, extraction_result, success=True)
            except Exception as e:
                logger.error(f"[OCR Queue] Failed to extract policy rules: {e}")
                # bank_id may be None here if the failure happened before the
                # replace() above ran (e.g. the policy_service import itself
                # failed) — fall back to the raw application_id rather than
                # crashing this handler with an UnboundLocalError.
                await _notify_backend_rules_extracted(
                    job_id, bank_id or item.application_id, {}, success=False, error=str(e)
                )

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
            job_id, error_info, int((time.time() - start) * 1000),
        )
        await _notify_backend_vectorized(job_id, 0, success=False, error=str(e))


async def _embed_and_store_chunks(job_id: str, chunks: list[dict]) -> int:
    """
    Embed all chunks for a document and upsert them.

    NOTE ON RATE LIMITING: this still uses a flat 60s sleep between
    batches, inherited from the original implementation, which is a blunt
    (and slow) way to respect an embedding-provider rate limit — a
    300-chunk document works out to ~14 minutes of pure dead waiting. This
    should be replaced with a shared token-bucket rate limiter around
    embed_batch() (so it only waits exactly as long as needed) once the
    real provider limits are known; that change belongs in
    services/llm/llm_facade.py rather than here, since the limiter needs
    to be shared across every caller of embed_batch, not just this queue.
    Left as-is here to avoid guessing at limits I can't see.
    """
    chunk_texts = [c["chunk_text"] for c in chunks]
    embeddings = []
    batch_size = 20
    for i in range(0, len(chunk_texts), batch_size):
        batch = chunk_texts[i:i + batch_size]
        logger.info(f"[OCR Queue] Job {job_id} embedding batch {i // batch_size + 1}/{(len(chunk_texts) - 1) // batch_size + 1}")
        batch_embs = await embed_batch(batch, use_last_key=False)
        embeddings.extend(batch_embs)
        if i + batch_size < len(chunk_texts):
            logger.info(f"[OCR Queue] Job {job_id} waiting 60s before next embedding batch...")
            await asyncio.sleep(60)

    for chunk, embedding in zip(chunks, embeddings):
        chunk["embedding"] = embedding

    return await upsert_document_chunks(chunks)


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


async def _notify_backend_rules_extracted(job_id: str, bank_id: str, extraction_result: dict, success: bool, error: str = ""):
    """PATCH callback to the backend to notify that policy rules were extracted."""
    try:
        payload = {
            "success": success,
            "bank_id": bank_id,
            "extraction_result": extraction_result,
            "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": error,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{settings.BACKEND_URL}/api/v1/ocr/jobs/{job_id}/rules-extracted",
                json=payload,
                headers={"x-internal-secret": settings.BACKEND_CALLBACK_SECRET},
            )
    except Exception as e:
        logger.warning(f"[OCR Queue] Backend callback failed for job {job_id}: {e}")