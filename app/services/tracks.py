
from sqlalchemy.orm import Session

from app.database import redis_cache as rc
from app.database.sqlfiles import sql

TRACK_TTL = 600  # 10 minutes


def _load_track(db: Session, track_id: int) -> dict | None:
    """Load track information from PostgreSQL."""
    row = db.execute(sql("get_track"), {"track_id": track_id}).first()

    if not row:
        return None

    info = dict(row._mapping)
    info["artist_names"] = info.pop("artists")
    return info


def get_track_info_cached(
    db: Session,
    track_id: int,
    use_cache: bool = True,
):
    """Return (track information, cache status)."""
    return rc.get_or_load(
        f"track:{track_id}",
        TRACK_TTL,
        lambda: _load_track(db, track_id),
        use_cache,
    )


def get_track_info(db: Session, track_id: int) -> dict | None:
    """Preserve the existing interface used by Kafka and playlists."""
    info, _ = get_track_info_cached(db, track_id)
    return info
