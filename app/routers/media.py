import logging
import os
from contextlib import contextmanager
from typing import BinaryIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from minio.error import S3Error
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.database import minio_store as store
from app.database import models as m
from app.database.postgres import get_db
from app.database.sqlfiles import sql

log = logging.getLogger("media")
router = APIRouter(tags=["media"])

AUDIO_TYPES = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
    "audio/ogg": "ogg", "audio/flac": "flac",
}
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_AUDIO = 30 * 1024 * 1024
MAX_IMAGE = 5 * 1024 * 1024


@contextmanager
def storage_errors():
    try:
        yield
    except store.StorageUnavailable as e:
        raise HTTPException(503, f"Object storage unavailable: {e}")
    except S3Error as e:
        raise HTTPException(502, f"Object storage error: {e.code}")


def _size(f: BinaryIO) -> int:
    f.seek(0, os.SEEK_END)
    n = f.tell()
    f.seek(0)
    return n


def _validate(file: UploadFile, types: dict[str, str], max_bytes: int) -> tuple[str, str, int]:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    ext = types.get(content_type)
    if not ext:
        raise HTTPException(415, f"Unsupported content type '{content_type}'. Allowed: {', '.join(types)}")
    size = _size(file.file)
    if size == 0:
        raise HTTPException(422, "Empty file")
    if size > max_bytes:
        raise HTTPException(413, f"File too large ({size} bytes, max {max_bytes})")
    return ext, content_type, size


def _best_effort_remove(bucket: str, key: str) -> None:
    try:
        store.remove(bucket, key)
    except Exception:
        log.warning("Could not remove old object %s/%s", bucket, key)


# ---------- Tracks: audio ----------
@router.post("/tracks/{track_id}/audio", status_code=201)
def upload_audio(track_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    track = db.get(m.Track, track_id)
    if not track:
        raise HTTPException(404, "Track not found")
    ext, content_type, size = _validate(file, AUDIO_TYPES, MAX_AUDIO)
    key = f"{track_id}.{ext}"
    with storage_errors():
        store.upload(store.AUDIO_BUCKET, key, file.file, size, content_type)
    old = track.audio_object_key
    track.audio_object_key = key
    db.commit()  # PostgreSQL keeps the metadata, MinIO keeps the bytes
    if old and old != key:
        _best_effort_remove(store.AUDIO_BUCKET, old)
    return {"track_id": track_id, "bucket": store.AUDIO_BUCKET, "object_key": key,
            "content_type": content_type, "size_bytes": size}


@router.get("/tracks/{track_id}/audio-url")
def audio_url(
    track_id: int,
    expires: int = Query(3600, ge=60, le=86400, description="seconds"),
    db: Session = Depends(get_db),
):
    row = db.execute(select(m.Track.audio_object_key).where(m.Track.track_id == track_id)).first()
    if row is None:
        raise HTTPException(404, "Track not found")
    if not row[0]:
        raise HTTPException(404, "No audio uploaded for this track")
    with storage_errors():
        if not store.object_exists(store.AUDIO_BUCKET, row[0]):
            raise HTTPException(404, "Audio object is missing in storage")
        url = store.presigned_get(store.AUDIO_BUCKET, row[0], expires)
    return {"track_id": track_id, "url": url, "expires_in": expires}


@router.get("/media/playable-tracks", response_model=list[schemas.TrackSearchOut])
def playable_tracks(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return [dict(r._mapping) for r in db.execute(sql("playable_tracks"), {"limit": limit})]


# ---------- Albums: cover art ----------
@router.post("/albums/{album_id}/cover", status_code=201)
def upload_cover(album_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    album = db.get(m.Album, album_id)
    if not album:
        raise HTTPException(404, "Album not found")
    ext, content_type, size = _validate(file, IMAGE_TYPES, MAX_IMAGE)
    key = f"{album_id}.{ext}"
    with storage_errors():
        store.upload(store.COVERS_BUCKET, key, file.file, size, content_type)
    old = album.cover_object_key
    album.cover_object_key = key
    db.commit()
    if old and old != key:
        _best_effort_remove(store.COVERS_BUCKET, old)
    return {"album_id": album_id, "bucket": store.COVERS_BUCKET, "object_key": key,
            "content_type": content_type, "size_bytes": size}


@router.get("/albums/{album_id}/cover-url")
def cover_url(
    album_id: int,
    expires: int = Query(3600, ge=60, le=86400, description="seconds"),
    db: Session = Depends(get_db),
):
    row = db.execute(select(m.Album.cover_object_key).where(m.Album.album_id == album_id)).first()
    if row is None:
        raise HTTPException(404, "Album not found")
    if not row[0]:
        raise HTTPException(404, "No cover uploaded for this album")
    with storage_errors():
        if not store.object_exists(store.COVERS_BUCKET, row[0]):
            raise HTTPException(404, "Cover object is missing in storage")
        url = store.presigned_get(store.COVERS_BUCKET, row[0], expires)
    return {"album_id": album_id, "url": url, "expires_in": expires}