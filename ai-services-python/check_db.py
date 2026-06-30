import asyncio
import json
from config.database import init_db, fetchrow, close_db

async def run():
    await init_db()
    row = await fetchrow("SELECT pg_typeof(underwriting_assessment) as type, underwriting_assessment FROM loans WHERE id = 'a7a61b06-67f4-4659-bc06-e8f806303a12'")
    print(f"Type: {row['type'] if row else 'No row'}")
    print(f"Content: {row['underwriting_assessment'] if row else 'No content'}")
    await close_db()

if __name__ == "__main__":
    asyncio.run(run())
