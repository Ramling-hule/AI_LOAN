import asyncio
import json
from loguru import logger
from config.database import fetchrow, execute
from services.extraction.extraction_service import extraction_service
from services.underwriting.underwriting_service import underwriting_service


class ProcessingQueue:
    def __init__(self):
        self.current_task: asyncio.Task | None = None
        self.current_job_id: str | None = None
        self._running = False

    async def start(self):
        """Start the background worker loop."""
        self._running = True
        logger.info("[Queue] Processing worker started.")
        asyncio.create_task(self._worker_loop())

    async def stop(self):
        """Stop the background worker."""
        self._running = False
        if self.current_task and not self.current_task.done():
            self.current_task.cancel()
        logger.info("[Queue] Processing worker stopped.")

    async def _worker_loop(self):
        while self._running:
            try:
                job_row = await fetchrow("""
                    SELECT * FROM loan_processing_jobs 
                    WHERE status IN ('pending', 'paused') 
                    ORDER BY priority DESC, created_at ASC 
                    LIMIT 1
                """)

                if not job_row:
                    await asyncio.sleep(5)
                    continue

                job = dict(job_row)
                self.current_job_id = str(job['id'])

                await execute("UPDATE loan_processing_jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid", self.current_job_id)
                logger.info(f"[Queue] Picked up job {self.current_job_id} for loan {job['loan_id']} (Priority: {job['priority']})")

                self.current_task = asyncio.create_task(self._process_job(job))

                try:
                    await self.current_task
                except asyncio.CancelledError:
                    logger.warning(f"[Queue] Job {self.current_job_id} was preempted/cancelled.")
                    await execute("UPDATE loan_processing_jobs SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid", self.current_job_id)
                finally:
                    self.current_task = None
                    self.current_job_id = None

            except Exception as e:
                # Typically transient network errors like [Errno 11001] or connection closed.
                # We log as warning instead of error because the loop intentionally sleeps and auto-recovers.
                logger.warning(f"[Queue] Worker loop network/DB warning (auto-retrying): {e}")
                await asyncio.sleep(5)

    async def _process_job(self, job: dict):
        """Execute the actual task. Can be cancelled midway."""
        job_id = str(job['id'])
        payload = json.loads(job['payload']) if isinstance(job['payload'], str) else job['payload']
        task_type = job['task_type']

        try:
            if task_type == 'extraction':
                ext = await extraction_service.run(
                    application_id=payload['application_id'],
                    loan_id=job['loan_id'],
                    enable_second_pass=payload.get('enable_second_pass', True),
                    force=payload.get('force', False)
                )
                summary = {
                    "gstin": ext.get("parameters", {}).get("gstin"),
                    "pan": ext.get("parameters", {}).get("pan"),
                    "annual_turnover": ext.get("parameters", {}).get("annual_turnover"),
                    "net_profit": ext.get("parameters", {}).get("net_profit"),
                    "overall_confidence": ext.get("overall_confidence"),
                    "missing_fields": ext.get("missing_fields", [])
                }
                await execute(
                    "UPDATE loans SET ai_extraction_id = $1::uuid, ai_extraction_status = 'completed', extracted_summary = $3::jsonb WHERE id = $2::uuid",
                    ext['extraction_id'], job['loan_id'], json.dumps(summary)
                )
            elif task_type == 'underwriting':
                assessment = await underwriting_service.assess(
                    application_id=payload['application_id'],
                    loan_id=job['loan_id'],
                    requested_amount=payload['requested_amount'],
                    bank_name=payload['bank_name'],
                    policies=payload.get('policies', [])
                )
                await execute(
                    "UPDATE loans SET underwriting_assessment = $1::jsonb, risk_score = $2 WHERE id = $3::uuid",
                    json.dumps(assessment), assessment.get('risk_score', 0), job['loan_id']
                )
            elif task_type == 'full_pipeline':
                ext = await extraction_service.run(
                    application_id=payload['application_id'],
                    loan_id=job['loan_id'],
                    enable_second_pass=True,
                    force=payload.get('force', False)
                )
                summary = {
                    "gstin": ext.get("parameters", {}).get("gstin"),
                    "pan": ext.get("parameters", {}).get("pan"),
                    "annual_turnover": ext.get("parameters", {}).get("annual_turnover"),
                    "net_profit": ext.get("parameters", {}).get("net_profit"),
                    "overall_confidence": ext.get("overall_confidence"),
                    "missing_fields": ext.get("missing_fields", [])
                }
                await execute(
                    "UPDATE loans SET ai_extraction_id = $1::uuid, ai_extraction_status = 'completed', extracted_summary = ($3::text)::jsonb WHERE id = $2::uuid",
                    ext['extraction_id'], job['loan_id'], json.dumps(summary)
                )
                # NOTE: previously there was a hardcoded `await asyncio.sleep(20.0)`
                # here "to respect API quotas." Now that services.llm.llm_facade
                # enforces the shared Gemini rate limit on every actual request
                # (centrally, across ALL callers — OCR, extraction, underwriting,
                # retrieval), an extra blanket sleep between phases is redundant
                # and just adds latency without adding safety. Removed.
                logger.info(f"[Queue] Extraction complete for job {job_id}. Proceeding to underwriting...")

                assessment = await underwriting_service.assess(
                    application_id=payload['application_id'],
                    loan_id=job['loan_id'],
                    requested_amount=payload['requested_amount'],
                    bank_name=payload['bank_name'],
                    policies=payload.get('policies', [])
                )
                await execute(
                    "UPDATE loans SET underwriting_assessment = ($1::text)::jsonb, risk_score = $2 WHERE id = $3::uuid",
                    json.dumps(assessment), assessment.get('risk_score', 0), job['loan_id']
                )
            else:
                raise ValueError(f"Unknown task type: {task_type}")

            await execute("UPDATE loan_processing_jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid", job_id)
            logger.info(f"[Queue] Job {job_id} completed successfully.")

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception(f"[Queue] Job {job_id} failed")
            await execute("UPDATE loan_processing_jobs SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid", str(e), job_id)

    async def enqueue(self, loan_id: str, task_type: str, payload: dict, priority: int = 1) -> str:
        """Enqueue a new job and return its ID."""
        row = await fetchrow("""
            INSERT INTO loan_processing_jobs (loan_id, priority, task_type, payload)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        """, loan_id, priority, task_type, json.dumps(payload))
        return str(row['id'])

    async def preempt(self, admin_loan_id: str, task_type: str, payload: dict) -> str:
        """Enqueue a high-priority job and cancel the current running job."""
        job_id = await self.enqueue(admin_loan_id, task_type, payload, priority=10)

        # Snapshot before checking, so we don't act on a job_id that changed
        # out from under us between the check and the fetch.
        running_task = self.current_task
        running_job_id = self.current_job_id

        if running_task and not running_task.done() and running_job_id:
            current_job = await fetchrow(
                "SELECT loan_id FROM loan_processing_jobs WHERE id = $1::uuid", running_job_id
            )
            if current_job and current_job['loan_id'] != admin_loan_id:
                logger.warning(f"[Queue] Preempting current job {running_job_id} for Admin Loan {admin_loan_id}")
                running_task.cancel()

        return job_id


processing_queue = ProcessingQueue()