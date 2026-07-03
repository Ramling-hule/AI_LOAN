import redis
import json
from loguru import logger
from config.settings import get_settings

settings = get_settings()

class CacheService:
    def __init__(self):
        redis_url = getattr(settings, "REDIS_URL", "redis://localhost:6379/0")
        try:
            client = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=1)
            # redis.from_url() is lazy — ping() forces an actual connection attempt
            client.ping()
            self.redis = client
            logger.info("✅ Redis connected for Policy Cache")
        except Exception as e:
            logger.warning(
                f"⚠️  Redis unavailable ({e.__class__.__name__}: {e}). "
                "Policy cache disabled — rules will be read directly from DB."
            )
            self.redis = None

    def _generate_key(self, bank_id: str, version: str, category: str = "all") -> str:
        return f"{bank_id}:{version}:{category}"

    def get_policy_bundle(self, bank_id: str, version: str, category: str = "all") -> dict | None:
        if not self.redis:
            return None
        try:
            key = self._generate_key(bank_id, version, category)
            data = self.redis.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            logger.warning(f"[Cache] get_policy_bundle failed (Redis error): {e}")
            return None

    def set_policy_bundle(self, bank_id: str, version: str, data: dict, category: str = "all"):
        if not self.redis:
            return
        try:
            key = self._generate_key(bank_id, version, category)
            self.redis.set(key, json.dumps(data))
            logger.info(f"[Cache] Cached policy bundle: {key}")
        except Exception as e:
            logger.warning(f"[Cache] set_policy_bundle failed (Redis error): {e}")

    def invalidate_bank_cache(self, bank_id: str):
        if not self.redis:
            return
        try:
            keys = self.redis.keys(f"{bank_id}:*")
            if keys:
                self.redis.delete(*keys)
                logger.info(f"[Cache] Invalidated {len(keys)} cache entries for {bank_id}")
        except Exception as e:
            logger.warning(f"[Cache] invalidate_bank_cache failed (Redis error): {e}")

cache_service = CacheService()
