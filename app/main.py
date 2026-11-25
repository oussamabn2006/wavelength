import asyncio
import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from minio.error import S3Error
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.database import cassandra_db as cass
from app.database import kafka_bus as kafka
from app.database import minio_store as store
from app.database import models  # noqa: F401  (registers tables on Base)
from app.database import redis_cache as rc
from app.database.postgres import Base, engine, get_db
from app.database.sqlfiles import sql
from app.routers import billing, cache, catalog, history, media, playlists, stats, users

logging.basicConfig(level=logging.INFO)


def init_postgres(retries: int = 10) -> None:
    for _ in range(retries):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError:
            time.sleep(2)
    raise RuntimeError("PostgreSQL not reachable")


def _connect_cassandra() -> None:
    try:
        cass.connect()
    except Exception:
        logging.getLogger("cassandra").exception("Cassandra connection failed")


def _init_minio() -> None:
    try:
        store.ensure_buckets()
    except Exception:
        logging.getLogger("minio").exception("MinIO initialisation failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_postgres()
    # Background threads: Cassandra and MinIO boot slowly, and the Postgres endpoints should work meanwhile.
    threading.Thread(target=_connect_cassandra, daemon=True).start()
    threading.Thread(target=_init_minio, daemon=True).start()
    kafka.start()  # non-blocking; librdkafka reconnects on its own if Kafka is not up yet
    yield
    await asyncio.to_thread(kafka.stop)
    cass.shutdown()


app = FastAPI(title="Spotify Data Platform", version="0.8.0", lifespan=lifespan)

for r in (catalog.router, users.router, billing.router, stats.router, history.router,
          playlists.router, cache.router, media.router):
    app.include_router(r, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "Welcome to the Spotify Data Platform API"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    db.execute(sql("ping"))
    return {"postgres": "ok"}


@app.get("/health/cassandra")
def health_cassandra():
    row = cass.get_session().execute(cass.prepared("cassandra_version")).one()
    return {"cassandra": "ok", "version": row.release_version}


@app.get("/health/kafka")
async def health_kafka():
    try:
        return await kafka.health()
    except kafka.KafkaUnavailable as e:
        raise HTTPException(503, f"Kafka unavailable: {e}")


@app.get("/health/redis")
def health_redis():
    try:
        return rc.health()
    except rc.CacheUnavailable as e:
        raise HTTPException(503, f"Redis unavailable: {e}")


@app.get("/health/minio")
def health_minio():
    try:
        return store.health()
    except store.StorageUnavailable as e:
        raise HTTPException(503, f"MinIO unavailable: {e}")
    except S3Error as e:
        raise HTTPException(502, f"MinIO error: {e.code}")


@app.get("/api/v1")
def api_info():
    return {"name": "Spotify Data Platform", "version": "v1"}