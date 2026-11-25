from fastapi import APIRouter, HTTPException

from app.database import redis_cache as rc

router = APIRouter(tags=["cache"])


@router.get("/cache/stats")
def cache_stats():
    try:
        return rc.stats()
    except rc.CacheUnavailable as e:
        raise HTTPException(503, f"Redis unavailable: {e}")


@router.delete("/cache")
def flush_cache(reset_metrics: bool = False):
    """Drops every cached entry (not the hit/miss counters unless reset_metrics=true)."""
    try:
        return {"deleted": rc.flush(reset_metrics)}
    except rc.CacheUnavailable as e:
        raise HTTPException(503, f"Redis unavailable: {e}")