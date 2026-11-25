"""Publishes the SAME play event twice, to prove the consumer is idempotent.

    python -m app.workers.send_duplicate_event
"""
import asyncio
from datetime import datetime, timezone

from cassandra.util import uuid_from_time

from app.database import kafka_bus as kafka
from app.database.postgres import SessionLocal
from app.services.events import PlayEvent
from app.services.tracks import get_track_info

USER_ID, TRACK_ID = 1, 1


async def main() -> None:
    with SessionLocal() as db:
        info = get_track_info(db, TRACK_ID)
    now = datetime.now(timezone.utc)
    event = PlayEvent(
        event_id=uuid_from_time(now), user_id=USER_ID, track_id=TRACK_ID, month=now.strftime("%Y-%m"),
        played_at=now, ms_played=info["duration_ms"], track_title=info["title"],
        artist_names=info["artist_names"], album_title=info["album_title"], duration_ms=info["duration_ms"],
    )
    kafka.start()
    payload = event.model_dump_json().encode()
    for _ in range(2):
        print("published:", await kafka.publish(str(USER_ID), payload))
    print("event_id:", event.event_id)
    kafka.stop()


asyncio.run(main())