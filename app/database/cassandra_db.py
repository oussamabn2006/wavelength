import logging
import os
import threading
import time
from pathlib import Path

from cassandra.cluster import Cluster, Session
from fastapi import HTTPException

from app.database.sqlfiles import CQL_DIR, cql, script_statements

log = logging.getLogger("cassandra")

HOST = os.getenv("CASSANDRA_HOST", "cassandra")  # compose service name, not localhost
PORT = int(os.getenv("CASSANDRA_PORT", "9042"))

try:  # the old default reactor (asyncore) was removed in Python 3.12
    from cassandra.io.asyncioreactor import AsyncioConnection as CONNECTION_CLASS
except Exception:  # pragma: no cover
    CONNECTION_CLASS = None

_cluster: Cluster | None = None
_session: Session | None = None
_lock = threading.Lock()
_prepared: dict[str, object] = {}


def run_script(session: Session, path: Path, timeout: float = 120) -> None:
    for stmt in script_statements(path):
        session.execute(stmt, timeout=timeout)


def connect(retries: int = 40, delay: float = 3.0) -> Session:
    """Connect (retrying while Cassandra boots) and apply app/cql/schema.cql."""
    global _cluster, _session
    with _lock:
        if _session is not None:
            return _session
        last_error = None
        for attempt in range(1, retries + 1):
            cluster = None
            try:
                kwargs = {"connection_class": CONNECTION_CLASS} if CONNECTION_CLASS else {}
                cluster = Cluster([HOST], port=PORT, **kwargs)
                session = cluster.connect()
                run_script(session, CQL_DIR / "schema.cql")
                _cluster, _session = cluster, session
                log.info("Cassandra connected (%s:%s)", HOST, PORT)
                return session
            except Exception as e:
                last_error = e
                log.warning("Cassandra not ready (attempt %d/%d): %s", attempt, retries, e)
                if cluster is not None:
                    try:
                        cluster.shutdown()
                    except Exception:
                        pass
                time.sleep(delay)
        raise RuntimeError("Could not connect to Cassandra") from last_error


def get_session() -> Session:
    if _session is None:
        raise HTTPException(503, "Cassandra is not connected yet (it may still be starting)")
    return _session


def prepared(name: str):
    """Prepared statement for a named query in app/cql/queries.cql (cached)."""
    stmt = _prepared.get(name)
    if stmt is None:
        stmt = get_session().prepare(cql(name))
        _prepared[name] = stmt
    return stmt


def shutdown() -> None:
    global _cluster, _session
    if _cluster is not None:
        _cluster.shutdown()
    _cluster = _session = None
    _prepared.clear()