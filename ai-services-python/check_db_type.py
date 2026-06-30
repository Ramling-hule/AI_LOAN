import asyncio
from config.database import init_db, fetchrow, close_db

async def run():
    await init_db()
    row = await fetchrow("SELECT jsonb_typeof(underwriting_assessment) as jt FROM loans WHERE id = 'a7a61b06-67f4-4659-bc06-e8f806303a12'")
    print(f"JSONB Type: {row['jt'] if row else 'No row'}")
    await close_db()

if __name__ == "__main__":
    asyncio.run(run())
