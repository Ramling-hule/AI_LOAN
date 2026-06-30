from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
from services.processing_queue import processing_queue
from config.database import fetchrow

router = APIRouter(prefix="/api/v1/queue", tags=["Queue"])

class PreemptBody(BaseModel):
    task_type: str = 'full_pipeline'
    payload: dict

@router.post("/preempt/{admin_loan_id}")
async def preempt_job(admin_loan_id: str, body: PreemptBody):
    """
    Forcefully process a loan by an admin.
    This preempts (cancels/pauses) the currently running job and prioritizes the admin's loan.
    """
    try:
        job_id = await processing_queue.preempt(admin_loan_id, body.task_type, body.payload)
        return {
            "success": True, 
            "message": "Preempted current job. Queued admin loan with priority.", 
            "data": {"job_id": job_id, "status": "queued"}
        }
    except Exception as e:
        logger.error(f"[Queue Router] Preempt failed for {admin_loan_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of a specific job in the processing queue."""
    row = await fetchrow("SELECT status, error_message FROM loan_processing_jobs WHERE id = $1", job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"success": True, "data": dict(row)}
