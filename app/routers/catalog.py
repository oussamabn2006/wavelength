from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.database import models as m
from app.database import redis_cache as rc
from app.database.postgres import get_db
from app.database.sqlfiles import sql
from app.services.tracks import get_track_info_cached

router = APIRouter(tags=["catalog"])


def _like_pattern(q: str | None) -> str:
    """Contains-match pattern; user-typed % and _ are escaped so they match literally."""
    if not q:
        return "%"
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _artist_track_ids(db: Session, artist_id: int) -> list[int]:
    return [r[0] for r in db.execute(sql("track_ids_by_artist"), {"artist_id": artist_id})]


def _invalidate_artist(track_ids: list[int]) -> None:
    """Track entries embed artist names, and top-artists aggregates them."""
    rc.delete(*[f"track:{t}" for t in track_ids])
    rc.delete_pattern("stats:top-artists:*")


# ---------- Artists: full CRUD through the ORM ----------
@router.get("/artists", response_model=list[schemas.ArtistOut])
def list_artists(
    q: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(m.Artist).order_by(m.Artist.artist_id).limit(limit).offset(offset)
    if q:
        stmt = stmt.where(m.Artist.name.ilike(_like_pattern(q)))
    return db.scalars(stmt).all()


@router.post("/artists", response_model=schemas.ArtistOut, status_code=201)
def create_artist(body: schemas.ArtistCreate, db: Session = Depends(get_db)):
    artist = m.Artist(**body.model_dump())
    db.add(artist)
    db.commit()
    return artist


@router.get("/artists/{artist_id}", response_model=schemas.ArtistDetail)
def get_artist(artist_id: int, db: Session = Depends(get_db)):
    artist = db.scalar(
        select(m.Artist).options(selectinload(m.Artist.albums)).where(m.Artist.artist_id == artist_id)
    )
    if not artist:
        raise HTTPException(404, "Artist not found")
    return artist


@router.put("/artists/{artist_id}", response_model=schemas.ArtistOut)
def update_artist(artist_id: int, body: schemas.ArtistUpdate, db: Session = Depends(get_db)):
    artist = db.get(m.Artist, artist_id)
    if not artist:
        raise HTTPException(404, "Artist not found")
    track_ids = _artist_track_ids(db, artist_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(artist, key, value)
    db.commit()
    _invalidate_artist(track_ids)  # after the commit, so no reader re-caches the old value
    return artist


@router.delete("/artists/{artist_id}", status_code=204)
def delete_artist(artist_id: int, db: Session = Depends(get_db)):
    artist = db.get(m.Artist, artist_id)
    if not artist:
        raise HTTPException(404, "Artist not found")
    track_ids = _artist_track_ids(db, artist_id)  # read first: the junction rows cascade away
    db.delete(artist)
    db.commit()
    _invalidate_artist(track_ids)


# ---------- Albums and genres (ORM) ----------
@router.get("/albums", response_model=list[schemas.AlbumSearchOut])
def search_albums(
    q: str | None = None,
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        sql("search_albums"), {"pattern": _like_pattern(q), "limit": limit, "offset": offset}
    )
    return [dict(r._mapping) for r in rows]


@router.get("/albums/{album_id}", response_model=schemas.AlbumDetail)
def get_album(album_id: int, db: Session = Depends(get_db)):
    album = db.scalar(
        select(m.Album)
        .options(selectinload(m.Album.tracks), selectinload(m.Album.artists))
        .where(m.Album.album_id == album_id)
    )
    if not album:
        raise HTTPException(404, "Album not found")
    return album


@router.get("/genres", response_model=list[schemas.GenreOut])
def list_genres(db: Session = Depends(get_db)):
    return db.scalars(select(m.Genre).order_by(m.Genre.name)).all()


# ---------- Tracks (advanced SQL from queries.sql) ----------
@router.get("/tracks", response_model=list[schemas.TrackSearchOut])
def search_tracks(
    q: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    # Not cached: the query text varies too much for a useful hit rate (the trigram index handles it).
    rows = db.execute(
        sql("search_tracks"), {"pattern": _like_pattern(q), "limit": limit, "offset": offset}
    )
    return [dict(r._mapping) for r in rows]


@router.get("/tracks/{track_id}", response_model=schemas.TrackSearchOut)
def get_track(
    track_id: int,
    response: Response,
    cache: bool = Query(True, description="false = bypass Redis (for benchmarks)"),
    db: Session = Depends(get_db),
):
    info, status = get_track_info_cached(db, track_id, cache)
    response.headers["X-Cache"] = status
    if not info:
        raise HTTPException(404, "Track not found")
    return {**info, "artists": info["artist_names"]}