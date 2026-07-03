import asyncio
import asyncpg
from config.settings import get_settings

async def migrate():
    try:
        conn = await asyncpg.connect(get_settings().DATABASE_URL)
        await conn.execute("""
            ALTER TABLE extracted_parameters
            ADD COLUMN IF NOT EXISTS semantic_rule_evaluations JSONB NOT NULL DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS semantic_rules_hash TEXT;
        """)
        print("Migration applied successfully.")
        await conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == '__main__':
    asyncio.run(migrate())
