import asyncio
import asyncpg
from config.settings import get_settings

async def check():
    conn = await asyncpg.connect(get_settings().DATABASE_URL)
    res = await conn.fetch("SELECT documents, business_info FROM loans LIMIT 1")
    for r in res:
        print(dict(r))
    await conn.close()

if __name__ == '__main__':
    asyncio.run(check())
