import asyncio
import time

class GlobalRateLimiter:
    """Proactively ensures API calls never exceed the specified requests per minute."""
    def __init__(self, rpm: int):
        self.interval = 60.0 / rpm
        self.lock = asyncio.Lock()
        self.last_call_time = 0.0

    async def acquire(self):
        async with self.lock:
            now = time.time()
            elapsed = now - self.last_call_time
            if elapsed < self.interval:
                wait_time = self.interval - elapsed
                await asyncio.sleep(wait_time)
            self.last_call_time = time.time()
