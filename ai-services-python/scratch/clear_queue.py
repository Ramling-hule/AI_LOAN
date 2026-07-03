import asyncio
import asyncpg
from config.settings import get_settings

async def clear_queue():
    try:
        conn = await asyncpg.connect(get_settings().DATABASE_URL)
        
        # Delete pending or running jobs from loan_processing_jobs
        res1 = await conn.execute("DELETE FROM loan_processing_jobs;")
        
        # Delete pending or running jobs from ocr_jobs
        res2 = await conn.execute("DELETE FROM ocr_jobs;")
        
        print(f"Successfully cleared queues. {res1} loan processing jobs and {res2} OCR jobs deleted.")
        await conn.close()
    except Exception as e:
        print(f"Failed to clear queue: {e}")

if __name__ == '__main__':
    asyncio.run(clear_queue())
