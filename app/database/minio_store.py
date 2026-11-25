"""MinIO (S3-compatible) object storage: audio in 'spotify-audio', covers in 'spotify-covers'.

Two clients share the same credentials:
  * internal (minio:9000)     uploads, stat, delete: used inside the Docker network
  * public   (localhost:9000) ONLY signs presigned URLs, so the browser can open them

A presigned URL is bound to the host it was signed for. Signing with 'minio:9000' would produce URLs
the browser cannot resolve. With the region fixed, signing makes no network call.
"""
import logging
import os
import time
from datetime import timedelta
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error
from urllib3.exceptions import HTTPError as Urllib3Error

log = logging.getLogger("minio")

ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
PUBLIC_ENDPOINT = os.getenv("MINIO_PUBLIC_ENDPOINT", "localhost:9000")
ACCESS_KEY = os.getenv("MINIO_ROOT_USER")
SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD")
REGION = "us-east-1"
AUDIO_BUCKET = os.getenv("MINIO_AUDIO_BUCKET", "spotify-audio")
COVERS_BUCKET = os.getenv("MINIO_COVERS_BUCKET", "spotify-covers")

_internal: Minio | None = None
_public: Minio | None = None
_MISSING = ("NoSuchKey", "NoSuchObject", "NotFound")


class StorageUnavailable(Exception):
    pass


def _clients() -> tuple[Minio, Minio]:
    global _internal, _public
    if _internal is None:
        if not ACCESS_KEY or not SECRET_KEY:
            raise StorageUnavailable("MINIO_ROOT_USER / MINIO_ROOT_PASSWORD are not set")
        _internal = Minio(ENDPOINT, access_key=ACCESS_KEY, secret_key=SECRET_KEY, secure=False, region=REGION)
        _public = Minio(PUBLIC_ENDPOINT, access_key=ACCESS_KEY, secret_key=SECRET_KEY, secure=False, region=REGION)
    return _internal, _public


def _call(fn, *args, **kwargs):
    """Network problems become StorageUnavailable; S3 errors (e.g. NoSuchKey) propagate."""
    try:
        return fn(*args, **kwargs)
    except S3Error:
        raise
    except (Urllib3Error, OSError) as e:
        raise StorageUnavailable(str(e)) from e


def ensure_buckets(retries: int = 40, delay: float = 3.0) -> None:
    """Create both buckets if missing, retrying while MinIO boots."""
    internal, _ = _clients()
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            for bucket in (AUDIO_BUCKET, COVERS_BUCKET):
                if not internal.bucket_exists(bucket):
                    internal.make_bucket(bucket)
                    log.info("Created bucket %s", bucket)
            log.info("MinIO ready (%s)", ENDPOINT)
            return
        except (S3Error, Urllib3Error, OSError) as e:
            last = e
            log.warning("MinIO not ready (attempt %d/%d): %s", attempt, retries, e)
            time.sleep(delay)
    raise RuntimeError("Could not reach MinIO") from last


def upload(bucket: str, key: str, fileobj: BinaryIO, size: int, content_type: str) -> None:
    internal, _ = _clients()
    _call(internal.put_object, bucket, key, fileobj, length=size, content_type=content_type)


def object_exists(bucket: str, key: str) -> bool:
    internal, _ = _clients()
    try:
        _call(internal.stat_object, bucket, key)
        return True
    except S3Error as e:
        if e.code in _MISSING:
            return False
        raise


def remove(bucket: str, key: str) -> None:
    internal, _ = _clients()
    _call(internal.remove_object, bucket, key)


def presigned_get(bucket: str, key: str, expires_s: int = 3600) -> str:
    _, public = _clients()
    return public.presigned_get_object(bucket, key, expires=timedelta(seconds=expires_s))


def health() -> dict:
    internal, _ = _clients()
    return {
        "minio": "ok",
        "buckets": {b: _call(internal.bucket_exists, b) for b in (AUDIO_BUCKET, COVERS_BUCKET)},
    }