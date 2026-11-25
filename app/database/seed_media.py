"""Generate sample audio (WAV tones) and cover art (PNG) and upload them to MinIO.
Also fills track.audio_object_key and album.cover_object_key in PostgreSQL.

    python -m app.database.seed_media                       # first 30 tracks, first 10 albums
    python -m app.database.seed_media --tracks 100 --albums 20

Real MP3s and covers go through the upload endpoints instead.
"""
import argparse
from datetime import date
import io
import math
import struct
import wave
import zlib

from sqlalchemy import select, update

from app.database.sqlfiles import sql
from app.database import minio_store as store
from app.database import models as m
from app.database.postgres import SessionLocal

RATE = 22050
SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16]  # a pentatonic-ish scale


def make_wav(track_id: int, seconds: int = 8) -> bytes:
    """A short melody whose notes depend on the track id, so tracks sound different."""
    root = 220 * 2 ** ((track_id % 12) / 12)
    n_notes = 8
    n = int(RATE * seconds / n_notes)
    frames = bytearray()
    for i in range(n_notes):
        freq = root * 2 ** (SEMITONES[(track_id * (i + 1) + i) % len(SEMITONES)] / 12)
        for k in range(n):
            env = min(1.0, k / 500, (n - k) / 500)  # short fade in/out: no clicks
            frames += struct.pack("<h", int(9000 * env * math.sin(2 * math.pi * freq * k / RATE)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    return buf.getvalue()


def make_png(album_id: int, size: int = 256) -> bytes:
    """A colored gradient, written with zlib/struct so no imaging library is needed."""
    r0, g0, b0 = (album_id * 67) % 256, (album_id * 131) % 256, (album_id * 197) % 256
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type: none
        for x in range(size):
            raw += bytes(((r0 + x) % 256, (g0 + y) % 256, (b0 + (x + y) // 2) % 256))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--tracks", type=int, default=30)
    p.add_argument("--albums", type=int, default=10)
    p.add_argument("--top", type=int, default=0,
                   help="also cover the N most played tracks of this month (and their albums)")
    a = p.parse_args()

    store.ensure_buckets(retries=5)
    with SessionLocal() as s:
        track_ids = list(s.scalars(select(m.Track.track_id).where(m.Track.track_id <= a.tracks)
                                   .order_by(m.Track.track_id)))
        album_ids = list(s.scalars(select(m.Album.album_id).where(m.Album.album_id <= a.albums)
                                   .order_by(m.Album.album_id)))
        if not track_ids:
            raise SystemExit("No tracks in PostgreSQL: run app.database.seed first")

        if a.top:
            month_start = date.today().replace(day=1)
            top_ids = [r[0] for r in s.execute(sql("top_tracks_by_month"),
                                               {"stat_month": month_start, "limit": a.top})]
            track_ids = sorted(set(track_ids) | set(top_ids))
            album_ids = sorted(set(album_ids) | {
                r[0] for r in s.execute(sql("album_ids_for_tracks"), {"ids": track_ids})})

        for i, tid in enumerate(track_ids, 1):
            data = make_wav(tid)
            key = f"{tid}.wav"
            store.upload(store.AUDIO_BUCKET, key, io.BytesIO(data), len(data), "audio/wav")
            s.execute(update(m.Track).where(m.Track.track_id == tid).values(audio_object_key=key))
            if i % 10 == 0:
                s.commit()
        s.commit()
        print(f"Audio: {len(track_ids)} tracks uploaded to '{store.AUDIO_BUCKET}'")

        for aid in album_ids:
            data = make_png(aid)
            key = f"{aid}.png"
            store.upload(store.COVERS_BUCKET, key, io.BytesIO(data), len(data), "image/png")
            s.execute(update(m.Album).where(m.Album.album_id == aid).values(cover_object_key=key))
        s.commit()
        print(f"Covers: {len(album_ids)} albums uploaded to '{store.COVERS_BUCKET}'")
    print("Done.")


if __name__ == "__main__":
    main()