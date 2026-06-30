import asyncio
import json
from config.database import init_db, fetchrow, close_db, execute

async def run():
    await init_db()
    
    test_dict = {"hello": "world"}
    test_str = json.dumps(test_dict)
    
    
    await execute("UPDATE loans SET underwriting_assessment = $1::jsonb WHERE id = 'a7a61b06-67f4-4659-bc06-e8f806303a12'", test_str)
    
    row = await fetchrow("SELECT jsonb_typeof(underwriting_assessment) as jt, underwriting_assessment FROM loans WHERE id = 'a7a61b06-67f4-4659-bc06-e8f806303a12'")
    print(f"When passing test_str to $1::jsonb -> Type: {row['jt']}, Content: {row['underwriting_assessment']}")
    
    await close_db()

if __name__ == "__main__":
    asyncio.run(run())
