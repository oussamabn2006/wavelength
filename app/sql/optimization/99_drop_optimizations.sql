-- Back to the "before" state, so the benchmark can be repeated.
DROP MATERIALIZED VIEW IF EXISTS mv_artist_monthly_plays;
DROP INDEX IF EXISTS ix_stats_month_plays;
DROP INDEX IF EXISTS ix_track_title_trgm;
DROP INDEX IF EXISTS ix_album_title_trgm;