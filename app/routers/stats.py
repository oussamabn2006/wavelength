from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app import schemas
from app.database import redis_cache as rc
from app.database.postgres import get_db
from app.database.sqlfiles import sql

router = APIRouter(tags=["stats"])

TOP_TTL = 300      # seconds: monthly stats change rarely
REVENUE_TTL = 60   # seconds: also invalidated explicitly when someone subscribes


def _month_start(month: str) -> date:
    return date.fromisoformat(f"{month}-01")


def _rows(db: Session, query: str, params: dict | None = None) -> list[dict]:
    return [dict(r._mapping) for r in db.execute(sql(query), params or {})]


@router.get("/stats/top-tracks", response_model=list[schemas.TopTrackOut])
def top_tracks(
    response: Response,
    month: str = Query(..., pattern=schemas.MONTH_RE, description="YYYY-MM"),
    limit: int = Query(10, ge=1, le=100),
    cache: bool = Query(True, description="false = bypass Redis (for benchmarks)"),
    db: Session = Depends(get_db),
):
    params = {"stat_month": _month_start(month), "limit": limit}
    rows, status = rc.get_or_load(
        f"stats:top-tracks:{month}:{limit}", TOP_TTL,
        lambda: _rows(db, "top_tracks_by_month", params), cache,
    )
    response.headers["X-Cache"] = status
    if not rows:
        raise HTTPException(404, "No stats for that month")
    return rows


@router.get("/stats/top-artists", response_model=list[schemas.TopArtistOut])
def top_artists(
    response: Response,
    month: str = Query(..., pattern=schemas.MONTH_RE, description="YYYY-MM"),
    limit: int = Query(10, ge=1, le=100),
    cache: bool = Query(True, description="false = bypass Redis (for benchmarks)"),
    db: Session = Depends(get_db),
):
    params = {"stat_month": _month_start(month), "limit": limit}
    rows, status = rc.get_or_load(
        f"stats:top-artists:{month}:{limit}", TOP_TTL,
        lambda: _rows(db, "top_artists_by_month", params), cache,
    )
    response.headers["X-Cache"] = status
    if not rows:
        raise HTTPException(404, "No stats for that month")
    return rows


@router.get("/stats/revenue-by-plan", response_model=list[schemas.RevenueByPlanOut])
def revenue_by_plan(
    response: Response,
    cache: bool = Query(True, description="false = bypass Redis (for benchmarks)"),
    db: Session = Depends(get_db),
):
    rows, status = rc.get_or_load(
        "stats:revenue", REVENUE_TTL, lambda: _rows(db, "revenue_by_plan"), cache
    )
    response.headers["X-Cache"] = status
    return rows or []