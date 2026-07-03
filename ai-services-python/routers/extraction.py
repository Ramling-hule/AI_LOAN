"""
FastAPI router for parameter extraction endpoints.
Replaces extraction.routes.js + extraction.controller.js.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from loguru import logger
from config.database import fetchrow
from services.extraction.extraction_service import extraction_service
from services.processing_queue import processing_queue

router = APIRouter(prefix="/api/v1/extraction", tags=["Extraction"])


class RunExtractionBody(BaseModel):
    loan_id: str
    enable_second_pass: bool = True

    @field_validator("loan_id")
    @classmethod
    def _not_blank(cls, v: str):
        if not v.strip():
            raise ValueError("loan_id must not be empty")
        return v


@router.post("/run/{application_id}")
async def run_extraction(application_id: str, body: RunExtractionBody):
    """
    Trigger parameter extraction for a loan application.
    Enqueues the job to run sequentially.
    """
    if not application_id.strip():
        raise HTTPException(status_code=400, detail="application_id must not be empty")
    try:
        payload = {
            "application_id": application_id,
            "enable_second_pass": body.enable_second_pass,
            "force": False
        }
        job_id = await processing_queue.enqueue(body.loan_id, 'extraction', payload)
        return {"success": True, "data": {"job_id": job_id, "status": "queued"}}
    except Exception as e:
        logger.error(f"[Extraction Router] Enqueue failed for {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rerun/{application_id}")
async def rerun_extraction(application_id: str, body: RunExtractionBody):
    """Force re-extraction, bypassing the cache."""
    if not application_id.strip():
        raise HTTPException(status_code=400, detail="application_id must not be empty")
    try:
        payload = {
            "application_id": application_id,
            "enable_second_pass": body.enable_second_pass,
            "force": True
        }
        job_id = await processing_queue.enqueue(body.loan_id, 'extraction', payload)
        return {"success": True, "data": {"job_id": job_id, "status": "queued"}}
    except Exception as e:
        logger.error(f"[Extraction Router] Re-extraction enqueue failed for {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/result/{application_id}")
async def get_extraction_result(application_id: str):
    """Fetch the stored extraction result from PostgreSQL."""
    row = await fetchrow(
        "SELECT * FROM extracted_parameters WHERE application_id = $1",
        application_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="No extraction result found for this application")

    return {"success": True, "data": extraction_service._format_result(dict(row))}