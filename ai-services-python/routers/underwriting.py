"""
FastAPI router for underwriting endpoints.
Replaces underwriting.routes.js + underwriting.controller.js.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from loguru import logger
from services.processing_queue import processing_queue

router = APIRouter(prefix="/api/v1/underwriting", tags=["Underwriting"])


class AssessBody(BaseModel):
    application_id: str
    loan_id: str
    requested_amount: float = 0.0
    bank_name: str = ""
    policies: list = []

    @field_validator("application_id", "loan_id", "bank_name")
    @classmethod
    def _not_blank(cls, v: str, info):
        # An empty bank_name silently leads to a "no active rules found"
        # assessment downstream instead of a clear 400 — fail fast here.
        if info.field_name == "bank_name" and not v.strip():
            raise ValueError("bank_name must not be empty")
        if info.field_name in {"application_id", "loan_id"} and not v.strip():
            raise ValueError(f"{info.field_name} must not be empty")
        return v


@router.post("/assess")
async def assess(body: AssessBody):
    """
    Run AI underwriting assessment for a loan application.
    Enqueues the job to run sequentially.
    """
    try:
        payload = {
            "application_id": body.application_id,
            "requested_amount": body.requested_amount,
            "bank_name": body.bank_name,
            "policies": body.policies
        }
        job_id = await processing_queue.enqueue(body.loan_id, 'underwriting', payload)
        return {"success": True, "data": {"job_id": job_id, "status": "queued"}}
    except Exception as e:
        logger.error(f"[Underwriting Router] Enqueue failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))