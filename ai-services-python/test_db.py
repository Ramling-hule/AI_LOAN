import asyncio, json
from config.database import init_db, fetchrow, close_db

async def run():
    await init_db()
    row = await fetchrow('SELECT application_id, confidence_scores FROM extracted_parameters ORDER BY updated_at DESC LIMIT 1')
    print(json.dumps(dict(row), default=str) if row else 'None')
    await close_db()

asyncio.run(run())