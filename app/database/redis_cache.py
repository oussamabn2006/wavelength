"""Cache-aside helper on top of Redis.

Values are stored as JSON under 'spotify:cache:<name>' with a TTL. If Redis is unreachable every
call degrades to "no cache": the loader runs and the API keeps working.
"""
import json
import logging
import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable

import redis

log = logging.getLogger("redis")

HOST = os.getenv("REDIS_HOST", "redis")  # compose service name, not localhost
PORT = int(os.getenv("REDIS_PORT", "6379"))
KEY = "spotify:cache:"
HITS = "spotify:metrics:hits"
MISSES = "spotify:metrics:misses"

# The client is lazy: nothing connects until the first command. Short timeouts keep a dead Redis cheap.
_client = redis.Redis(
    host=HOST, port=PORT, decode_responses=True,
    socket_timeout=0.5, socket_connect_timeout=0.5, health_check_interval=30,
)


class CacheUnavailable(Exception):
    pass


def _enc(o: Any):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    raise TypeError(f"not JSON serializable: {type(o)}")


def _count(counter: str) -> None:
    try:
        _client.incr(counter)
    except redis.RedisError:
        pass


def get_or_load(name: str, ttl: int, loader: Callable[[], Any], use_cache: bool = True):
    """Returns (value, status) where status is HIT, MISS, BYPASS (cache=false) or DOWN (Redis down).

    Empty results (None, [], {}) are never cached, so a 404 can't get stuck in the cache.
    """
    if not use_cache:
        return loader(), "BYPASS"
    key = KEY + name
    try:
        raw = _client.get(key)
    except redis.RedisError as e:
        log.warning("Redis unavailable (%s): serving from the database", e)
        return loader(), "DOWN"
    if raw is not None:
        _count(HITS)
        return json.loads(raw), "HIT"
    value = loader()
    _count(MISSES)
    if value:
        try:
            _client.set(key, json.dumps(value, default=_enc), ex=ttl)
        except (redis.RedisError, TypeError) as e:
            log.warning("Could not cache %s: %s", name, e)
    return value, "MISS"


def delete(*names: str) -> int:
    """Invalidate exact keys. Never raises: the TTL is the fallback if Redis is down."""
    if not names:
        return 0
    try:
        return _client.unlink(*[KEY + n for n in names])
    except redis.RedisError as e:
        log.warning("Cache invalidation failed (%s); entries expire by TTL", e)
        return 0


def delete_pattern(pattern: str) -> int:
    """Invalidate every key matching a glob, e.g. 'stats:top-artists:*'."""
    try:
        keys = list(_client.scan_iter(match=KEY + pattern, count=500))
        return _client.unlink(*keys) if keys else 0
    except redis.RedisError as e:
        log.warning("Cache invalidation failed (%s); entries expire by TTL", e)
        return 0


def flush(reset_metrics: bool = False) -> int:
    try:
        keys = list(_client.scan_iter(match=KEY + "*", count=500))
        deleted = _client.unlink(*keys) if keys else 0
        if reset_metrics:
            _client.delete(HITS, MISSES)
        return deleted
    except redis.RedisError as e:
        raise CacheUnavailable(str(e)) from e


def health() -> dict:
    try:
        _client.ping()
        return {"redis": "ok", "version": _client.info("server").get("redis_version")}
    except redis.RedisError as e:
        raise CacheUnavailable(str(e)) from e


def stats() -> dict:
    try:
        hits = int(_client.get(HITS) or 0)
        misses = int(_client.get(MISSES) or 0)
        mem = _client.info("memory")
        evicted = _client.info("stats").get("evicted_keys")
        keys = sum(1 for _ in _client.scan_iter(match=KEY + "*", count=500))
    except redis.RedisError as e:
        raise CacheUnavailable(str(e)) from e
    total = hits + misses
    return {
        "hits": hits,
        "misses": misses,
        "hit_ratio": round(hits / total, 3) if total else None,
        "cached_keys": keys,
        "used_memory": mem.get("used_memory_human"),
        "maxmemory": mem.get("maxmemory_human"),
        "eviction_policy": mem.get("maxmemory_policy"),
        "evicted_keys": evicted,
    }