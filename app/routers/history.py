from datetime import datetime, timedelta, timezone
from uuid import UUID

from cassandra.util import datetime_from_uuid1, uuid_from_time
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app import schemas
from app.database import cassandra_db as cass
from app.database import kafka_bus as kafka
from app.database import models as m
from app.database.postgres import get_db
from app.services.events import PlayEvent
from app.services.tracks import get_track_info

router = APIRouter(tags=["history"])


class PlayIn(BaseModel):
    track_id: int
    ms_played: int | None = Field(None, ge=0)


class PlayAccepted(BaseModel):
    event_id: str
    user_id: int
    track_id: int
    month: str
    status: str
    partition: int
    offset: int
    status_url: str


class HistoryItem(BaseModel):
    event_id: str
    track_id: int
    track_title: str
    artist_names: str
    album_title: str
    duration_ms: int
    ms_played: int
    played_at: datetime


def _months_back(n: int):
    d = datetime.now(timezone.utc).replace(day=1)
    for _ in range(n):
        yield d.strftime("%Y-%m")
        d = (d - timedelta(days=1)).replace(day=1)


@router.post("/users/{user_id}/history", status_code=202, response_model=PlayAccepted)
async def record_play(user_id: int, body: PlayIn, db: Session = Depends(get_db)):
    """Asynchronous path: validate in PostgreSQL, publish to Kafka, return 202.

    202 means "the broker has the event", NOT "it is in Cassandra yet". The consumer persists it
    shortly after; poll status_url to see when it is processed.
    """
    # The Postgres calls are synchronous, so they run in the threadpool to keep the loop free.
    if not await run_in_threadpool(db.get, m.AppUser, user_id):
        raise HTTPException(404, "User not found")
    info = await run_in_threadpool(get_track_info, db, body.track_id)
    if not info:
        raise HTTPException(404, "Track not found")

    now = datetime.now(timezone.utc)
    event = PlayEvent(
        event_id=uuid_from_time(now), user_id=user_id, track_id=info["track_id"],
        month=now.strftime("%Y-%m"), played_at=now,
        ms_played=body.ms_played if body.ms_played is not None else info["duration_ms"],
        track_title=info["title"], artist_names=info["artist_names"],
        album_title=info["album_title"], duration_ms=info["duration_ms"],
    )
    try:
        # Key = user_id: all events of one user go to the same partition, so they stay in order.
        partition, offset = await kafka.publish(str(user_id), event.model_dump_json().encode())
    except kafka.KafkaUnavailable as e:
        raise HTTPException(503, f"Event queue unavailable: {e}")
    return PlayAccepted(
        event_id=str(event.event_id), user_id=user_id, track_id=event.track_id, month=event.month,
        status="accepted", partition=partition, offset=offset,
        status_url=f"/api/v1/users/{user_id}/history/events/{event.event_id}",
    )


@router.get("/users/{user_id}/history/events/{event_id}")
def event_status(user_id: int, event_id: UUID):
    """'processed' once the consumer has written the event to Cassandra, otherwise 'pending'."""
    if event_id.version != 1:
        raise HTTPException(422, "event_id must be a timeuuid (UUID v1)")
    month = datetime_from_uuid1(event_id).strftime("%Y-%m")  # the month is embedded in the id
    row = cass.get_session().execute(cass.prepared("select_history_event"), (user_id, month, event_id)).one()
    return {
        "event_id": str(event_id),
        "status": "processed" if row else "pending",
        "track_title": row.track_title if row else None,
    }


@router.post("/users/{user_id}/history/direct", status_code=201)
def record_play_direct(user_id: int, body: PlayIn, db: Session = Depends(get_db)):
    """The previous synchronous path (writes Cassandra inside the request). Kept for comparison."""
    if not db.get(m.AppUser, user_id):
        raise HTTPException(404, "User not found")
    info = get_track_info(db, body.track_id)
    if not info:
        raise HTTPException(404, "Track not found")

    session = cass.get_session()
    now = datetime.now(timezone.utc)
    month = now.strftime("%Y-%m")
    ms_played = body.ms_played if body.ms_played is not None else info["duration_ms"]
    event_id = uuid_from_time(now)
    session.execute(cass.prepared("insert_history"), (
        user_id, month, event_id, info["track_id"], info["title"], info["artist_names"],
        info["album_title"], info["duration_ms"], ms_played, now,
    ))
    session.execute(cass.prepared("increment_plays"), (1, month, info["track_id"]))
    return {"event_id": str(event_id), "user_id": user_id, "track_id": info["track_id"], "month": month}


@router.get("/users/{user_id}/history", response_model=list[HistoryItem])
def get_history(
    user_id: int,
    month: str | None = Query(None, pattern=schemas.MONTH_RE, description="YYYY-MM; omit for most recent"),
    limit: int = Query(20, ge=1, le=200),
):
    session = cass.get_session()
    stmt = cass.prepared("select_history")
    items: list[HistoryItem] = []
    for mth in ([month] if month else _months_back(12)):
        for r in session.execute(stmt, (user_id, mth, limit - len(items))):
            items.append(HistoryItem(
                event_id=str(r.event_id), track_id=r.track_id, track_title=r.track_title,
                artist_names=r.artist_names, album_title=r.album_title,
                duration_ms=r.duration_ms, ms_played=r.ms_played, played_at=r.played_at,
            ))
        if len(items) >= limit:
            break
    return items


@router.get("/tracks/{track_id}/plays")
def track_plays(track_id: int, month: str = Query(..., pattern=schemas.MONTH_RE)):
    row = cass.get_session().execute(cass.prepared("select_plays"), (month, track_id)).one()
    return {"track_id": track_id, "month": month, "plays": row.plays if row else 0}