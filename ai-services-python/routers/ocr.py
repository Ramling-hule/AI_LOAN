"""
FastAPI routers for OCR endpoints.
Replaces ocr.routes.js + ocr.controller.js.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from loguru import logger
from config.database import fetchrow, execute
from services.ocr.ocr_queue import submit_job, get_job_state, OcrQueueItem

router = APIRouter(prefix="/api/v1/ocr", tags=["OCR"])


@router.post("/process")
async def process_document(
    file: UploadFile = File(...),
    job_id: str = Form(...),
    application_id: str = Form(""),
    document_type: str = Form("general"),
    document_url: str = Form(""),
    extract_only: bool = Form(False),
):
    """
    Accept a document file and queue it for OCR + vectorization.
    Equivalent to POST /api/v1/ocr/process in the Node.js service.
    """
    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    item = OcrQueueItem(
        job_id=job_id,
        file_bytes=file_bytes,
        filename=file.filename or "document",
        mime_type=file.content_type or "application/octet-stream",
        application_id=application_id,
        document_type=document_type,
        document_url=document_url,
        extract_only=extract_only,
    )

    success = await submit_job(item)
    if not success:
        raise HTTPException(status_code=503, detail="OCR queue is full. Please try again later.")

    logger.info(f"[OCR Router] Job {job_id} queued for file: {file.filename}")
    return {
        "success": True,
        "data": {
            "job_id": job_id,
            "status": "queued",
            "filename": file.filename,
        },
    }


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get OCR job status from PostgreSQL."""
    row = await fetchrow("SELECT * FROM ocr_jobs WHERE id = $1", job_id)
    if not row:
        
        state = get_job_state(job_id)
        if not state:
            raise HTTPException(status_code=404, detail="OCR job not found")
        return {"success": True, "data": {"job_id": job_id, **state}}

    job = dict(row)
    return {"success": True, "data": job}


@router.post("/retry/{job_id}")
async def retry_job(job_id: str):
    """Re-queue a failed OCR job."""
    row = await fetchrow("SELECT * FROM ocr_jobs WHERE id = $1 AND status = 'failed'", job_id)
    if not row:
        raise HTTPException(status_code=400, detail="Job not found or not in failed state")

    await execute(
        "UPDATE ocr_jobs SET status = 'queued', attempts = 0, error_info = NULL WHERE id = $1",
        job_id,
    )

    
    return {"success": True, "message": f"Job {job_id} re-queued for retry"}
