"""
FastAPI router for underwriting endpoints.
Replaces underwriting.routes.js + underwriting.controller.js.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
from services.underwriting.underwriting_service import underwriting_service

router = APIRouter(prefix="/api/v1/underwriting", tags=["Underwriting"])


class AssessBody(BaseModel):
    application_id: str
    loan_id: str
    requested_amount: float = 0.0
    bank_name: str = ""
    policies: list = []


@router.post("/assess")
async def assess(body: AssessBody):
    """
    Run AI underwriting assessment for a loan application.
    Equivalent to POST /api/v1/underwriting/assess.
    """
    try:
        assessment = await underwriting_service.assess(
            application_id=body.application_id,
            loan_id=body.loan_id,
            requested_amount=body.requested_amount,
            bank_name=body.bank_name,
            policies=body.policies,
        )
        return {"success": True, "data": assessment}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Underwriting Router] Assessment failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
