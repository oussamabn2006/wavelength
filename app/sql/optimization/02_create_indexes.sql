-- Optimization indexes. Structural indexes (PK, FK, unique) stay in models.py.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Q1: top tracks of a month, already sorted by play_count
CREATE INDEX IF NOT EXISTS ix_stats_month_plays
    ON monthly_track_stats (stat_month, play_count DESC);

-- Q2: ILIKE '%word%' title search
CREATE INDEX IF NOT EXISTS ix_track_title_trgm
    ON track USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_album_title_trgm ON  album USING gin (title gin_trgm_ops);

ANALYZE monthly_track_stats;
ANALYZE track;