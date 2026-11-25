"""The playback event: the contract between the API (producer) and the consumer."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas import MONTH_RE


class PlayEvent(BaseModel):
    v: int = 1                       # schema version
    event_id: UUID                   # timeuuid, also the Cassandra clustering key = idempotency key
    user_id: int
    track_id: int
    month: str = Field(pattern=MONTH_RE)
    played_at: datetime
    ms_played: int = Field(ge=0)
    # Denormalized at publish time so the consumer never needs PostgreSQL
    track_title: str
    artist_names: str
    album_title: str
    duration_ms: int