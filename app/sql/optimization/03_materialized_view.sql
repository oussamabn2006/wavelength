-- Aggregated view for Q3 (top artists). Refresh it after monthly_track_stats changes:
--   REFRESH MATERIALIZED VIEW mv_artist_monthly_plays;
DROP MATERIALIZED VIEW IF EXISTS mv_artist_monthly_plays;

CREATE MATERIALIZED VIEW mv_artist_monthly_plays AS
SELECT s.stat_month, ar.artist_id, ar.name, SUM(s.play_count) AS play_count
FROM monthly_track_stats s
JOIN track_artist ta ON ta.track_id = s.track_id AND ta.role = 'primary'
JOIN artist ar ON ar.artist_id = ta.artist_id
GROUP BY s.stat_month, ar.artist_id, ar.name
WITH DATA;

CREATE INDEX ix_mv_artist_month_plays ON mv_artist_monthly_plays (stat_month, play_count DESC);
ANALYZE mv_artist_monthly_plays;

\echo ==== Q3 via materialized view - run 1 (warm-up)
EXPLAIN (ANALYZE, BUFFERS)
SELECT artist_id, name, play_count
FROM mv_artist_monthly_plays
WHERE stat_month = date_trunc('month', CURRENT_DATE)::date
ORDER BY play_count DESC
LIMIT 10;

\echo ==== Q3 via materialized view - run 2 (record this one)
EXPLAIN (ANALYZE, BUFFERS)
SELECT artist_id, name, play_count
FROM mv_artist_monthly_plays
WHERE stat_month = date_trunc('month', CURRENT_DATE)::date
ORDER BY play_count DESC
LIMIT 10;