"""Loads SQL / CQL text from files, so no query text lives in Python code.

  app/sql/queries.sql   named queries for SQLAlchemy    ("-- name: foo")
  app/cql/queries.cql   named prepared statements       ("-- name: foo")
  *.sql / *.cql scripts plain statements separated by ';'

Files are read once and cached: restart the backend after editing them.
"""
import re
from functools import lru_cache
from pathlib import Path

from sqlalchemy import text

APP_DIR = Path(__file__).resolve().parent.parent
SQL_DIR = APP_DIR / "sql"
CQL_DIR = APP_DIR / "cql"

_NAME = re.compile(r"^--\s*name:\s*(\w+)\s*$", re.MULTILINE)


def _strip_comments(body: str) -> str:
    lines = (ln for ln in body.splitlines() if not ln.strip().startswith(("--", "//")))
    return "\n".join(lines).strip()


@lru_cache(maxsize=None)
def _named(path: Path) -> dict[str, str]:
    parts = _NAME.split(path.read_text(encoding="utf-8"))
    # parts = [preamble, name1, body1, name2, body2, ...]
    return {
        name: _strip_comments(body).rstrip(";").strip()
        for name, body in zip(parts[1::2], parts[2::2])
    }


def _get(path: Path, name: str) -> str:
    try:
        return _named(path)[name]
    except KeyError:
        raise KeyError(f"No query named '{name}' in {path}") from None


def sql(name: str):
    """Named SQL query from app/sql/queries.sql, ready for session.execute()."""
    return text(_get(SQL_DIR / "queries.sql", name))


def cql(name: str) -> str:
    """Named CQL statement from app/cql/queries.cql."""
    return _get(CQL_DIR / "queries.cql", name)


def script_statements(path: Path) -> list[str]:
    """Statements of a plain script file (split on ';', comments removed)."""
    body = _strip_comments(path.read_text(encoding="utf-8"))
    return [s.strip() for s in body.split(";") if s.strip()]


def run_sql_script(conn, path: Path) -> None:
    for stmt in script_statements(path):
        conn.execute(text(stmt))