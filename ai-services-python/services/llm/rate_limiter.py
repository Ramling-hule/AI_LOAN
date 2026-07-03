"""
Process-wide async rate limiter for external LLM APIs.

Enforces a sliding-window cap (e.g. 15 requests/minute on a free tier)
across ALL callers — regardless of how many concurrent jobs, workers, or
chunks are trying to call the API at once. Concurrency at the job/worker
level is fine; this is what actually protects the quota.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque

from config.settings import get_settings

settings = get_settings()


class RateLimiter:
    """Sliding-window limiter: at most `max_calls` calls per `period` seconds."""

    def __init__(self, max_calls: int, period: float):
        self.max_calls = max_calls
        self.period = period
        self._calls: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                while self._calls and now - self._calls[0] > self.period:
                    self._calls.popleft()
                if len(self._calls) < self.max_calls:
                    self._calls.append(now)
                    return
                wait = self.period - (now - self._calls[0])
                await asyncio.sleep(max(wait, 0.05))


# Shared instance for Gemini (free tier: 15 requests/minute by default).
# Override via settings if you're on a paid tier or a different quota.
gemini_limiter = RateLimiter(
    max_calls=getattr(settings, "GEMINI_MAX_REQUESTS_PER_MINUTE", 15),
    period=getattr(settings, "GEMINI_RATE_LIMIT_WINDOW_SECONDS", 60),
)
