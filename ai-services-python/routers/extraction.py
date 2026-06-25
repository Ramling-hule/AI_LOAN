"""
FastAPI router for parameter extraction endpoints.
Replaces extraction.routes.js + extraction.controller.js.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
from config.database import fetchrow
from services.extraction.extraction_service import extraction_service

router = APIRouter(prefix="/api/v1/extraction", tags=["Extraction"])


class RunExtractionBody(BaseModel):
    loan_id: str
    enable_second_pass: bool = True


@router.post("/run/{application_id}")
async def run_extraction(application_id: str, body: RunExtractionBody):
    """
    Trigger parameter extraction for a loan application.
    Equivalent to POST /api/v1/extraction/run/:applicationId.
    """
    try:
        result = await extraction_service.run(
            application_id=application_id,
            loan_id=body.loan_id,
            enable_second_pass=body.enable_second_pass,
            force=False,
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"[Extraction Router] Extraction failed for {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rerun/{application_id}")
async def rerun_extraction(application_id: str, body: RunExtractionBody):
    """Force re-extraction, bypassing the cache."""
    try:
        result = await extraction_service.run(
            application_id=application_id,
            loan_id=body.loan_id,
            enable_second_pass=body.enable_second_pass,
            force=True,
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"[Extraction Router] Re-extraction failed for {application_id}: {e}")
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
