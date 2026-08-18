import asyncio
import random
import time
from typing import Any, Callable
from app.core.config import settings


class AdaptiveRateLimiter:

  def __init__(self):
    self._request_timestamps = []
    self._semaphore = asyncio.Semaphore(settings.limits.global_semaphore_limit)
    self._lock = asyncio.Lock()

  def sync_semaphore(self):
    """Syncs semaphore when tier limits are updated."""
    self._semaphore = asyncio.Semaphore(settings.limits.global_semaphore_limit)

  async def acquire_slot(self):
    """Enforces sliding 60-second RPM window with automatic backoff smoothing."""
    while True:
      async with self._lock:
        now = time.time()
        self._request_timestamps = [
            t for t in self._request_timestamps if now - t < 60
        ]

        if (
            len(self._request_timestamps)
            < settings.limits.max_requests_per_minute
        ):
          self._request_timestamps.append(now)
          break

      sleep_time = random.uniform(1.2, 2.5)
      await asyncio.sleep(sleep_time)

  async def execute_with_resilience(
      self, func: Callable, *args, **kwargs
  ) -> Any:
    """Executes a blocking function through the dynamic semaphore & rate limiter pool."""
    await self.acquire_slot()
    async with self._semaphore:
      loop = asyncio.get_running_loop()
      return await loop.run_in_executor(None, func, *args, **kwargs)

  # Alias for backward/forward compatibility
  async def execute(self, func: Callable, *args, **kwargs) -> Any:
    return await self.execute_with_resilience(func, *args, **kwargs)


rate_limiter = AdaptiveRateLimiter()