from datetime import datetime, timezone
from uuid import UUID

from cassandra.query import BatchStatement
from cassandra.util import uuid_from_time
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import cassandra_db as cass
from app.database import models as m
from app.database.postgres import get_db
from app.services.tracks import get_track_info

router = APIRouter(tags=["playlists"])


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(None, max_length=300)


class PlaylistOut(BaseModel):
    playlist_id: str
    user_id: int
    name: str
    description: str | None
    created_at: datetime


class PlaylistTrackOut(BaseModel):
    track_position: int
    track_id: int
    track_title: str
    artist_names: str
    duration_ms: int
    added_at: datetime


class PlaylistDetail(PlaylistOut):
    tracks: list[PlaylistTrackOut]


class AddTrackIn(BaseModel):
    track_id: int


def _pl_out(r) -> PlaylistOut:
    return PlaylistOut(playlist_id=str(r.playlist_id), user_id=r.user_id, name=r.name,
                       description=r.description, created_at=r.created_at)


@router.post("/users/{user_id}/playlists", response_model=PlaylistOut, status_code=201)
def create_playlist(user_id: int, body: PlaylistCreate, db: Session = Depends(get_db)):
    if not db.get(m.AppUser, user_id):
        raise HTTPException(404, "User not found")
    session = cass.get_session()
    now = datetime.now(timezone.utc)
    pid = uuid_from_time(now)
    # The playlist is written to two query-specific tables; a logged batch keeps them in sync.
    batch = BatchStatement()
    batch.add(cass.prepared("insert_playlist_by_user"), (user_id, pid, body.name, body.description, now))
    batch.add(cass.prepared("insert_playlist_by_id"), (pid, user_id, body.name, body.description, now))
    session.execute(batch)
    return PlaylistOut(playlist_id=str(pid), user_id=user_id, name=body.name,
                       description=body.description, created_at=now)


@router.get("/users/{user_id}/playlists", response_model=list[PlaylistOut])
def list_playlists(user_id: int):
    rows = cass.get_session().execute(cass.prepared("select_playlists_by_user"), (user_id,))
    return [_pl_out(r) for r in rows]


@router.get("/playlists/{playlist_id}", response_model=PlaylistDetail)
def get_playlist(playlist_id: UUID):
    session = cass.get_session()
    head = session.execute(cass.prepared("select_playlist_by_id"), (playlist_id,)).one()
    if not head:
        raise HTTPException(404, "Playlist not found")
    tracks = [
        PlaylistTrackOut(track_position=r.track_position, track_id=r.track_id, track_title=r.track_title,
                         artist_names=r.artist_names, duration_ms=r.duration_ms, added_at=r.added_at)
        for r in session.execute(cass.prepared("select_playlist_tracks"), (playlist_id,))
    ]
    return PlaylistDetail(**_pl_out(head).model_dump(), tracks=tracks)


@router.post("/playlists/{playlist_id}/tracks", response_model=PlaylistTrackOut, status_code=201)
def add_track(playlist_id: UUID, body: AddTrackIn, db: Session = Depends(get_db)):
    session = cass.get_session()
    if not session.execute(cass.prepared("select_playlist_by_id"), (playlist_id,)).one():
        raise HTTPException(404, "Playlist not found")
    info = get_track_info(db, body.track_id)
    if not info:
        raise HTTPException(404, "Track not found")

    now = datetime.now(timezone.utc)
    for _ in range(5):
        last = session.execute(cass.prepared("select_max_position"), (playlist_id,)).one()
        pos = (last.track_position + 1) if last else 1
        # Lightweight transaction: not applied if another request took this position first.
        rs = session.execute(cass.prepared("insert_playlist_track_if_absent"), (
            playlist_id, pos, info["track_id"], info["title"], info["artist_names"],
            info["duration_ms"], now,
        ))
        if rs.was_applied:
            return PlaylistTrackOut(track_position=pos, track_id=info["track_id"], track_title=info["title"],
                                    artist_names=info["artist_names"], duration_ms=info["duration_ms"],
                                    added_at=now)
    raise HTTPException(409, "Playlist is being modified concurrently, please retry")


@router.delete("/playlists/{playlist_id}/tracks/{track_position}", status_code=204)
def remove_track(playlist_id: UUID, track_position: int):
    cass.get_session().execute(cass.prepared("delete_playlist_track"), (playlist_id, track_position))
    return Response(status_code=204)