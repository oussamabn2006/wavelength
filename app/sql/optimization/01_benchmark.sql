-- Run this file twice: before and after 02_create_indexes.sql.
-- Every query runs twice. The first run warms the cache, so record the SECOND "Execution Time".
-- Change the search term below if you want another word.
\set term '%strategy%'

\echo ==== Q1 top 10 tracks of the current month - run 1 (warm-up)
EXPLAIN (ANALYZE, BUFFERS)
SELECT t.track_id, t.title, s.play_count
FROM monthly_track_stats s
JOIN track t ON t.track_id = s.track_id
WHERE s.stat_month = date_trunc('month', CURRENT_DATE)::date
ORDER BY s.play_count DESC
LIMIT 10;

\echo ==== Q1 - run 2 (record this one)
EXPLAIN (ANALYZE, BUFFERS)
SELECT t.track_id, t.title, s.play_count
FROM monthly_track_stats s
JOIN track t ON t.track_id = s.track_id
WHERE s.stat_month = date_trunc('month', CURRENT_DATE)::date
ORDER BY s.play_count DESC
LIMIT 10;

\echo ==== Q2 title search, all matches (no LIMIT, to measure the access path) - run 1 (warm-up)
EXPLAIN (ANALYZE, BUFFERS)
SELECT track_id, title FROM track WHERE title ILIKE :'term';

\echo ==== Q2 - run 2 (record this one)
EXPLAIN (ANALYZE, BUFFERS)
SELECT track_id, title FROM track WHERE title ILIKE :'term';

\echo ==== Q3 top 10 artists of the current month, live aggregation - run 1 (warm-up)
EXPLAIN (ANALYZE, BUFFERS)
SELECT ar.artist_id, ar.name, SUM(s.play_count) AS play_count
FROM monthly_track_stats s
JOIN track_artist ta ON ta.track_id = s.track_id AND ta.role = 'primary'
JOIN artist ar ON ar.artist_id = ta.artist_id
WHERE s.stat_month = date_trunc('month', CURRENT_DATE)::date
GROUP BY ar.artist_id, ar.name
ORDER BY play_count DESC
LIMIT 10;

\echo ==== Q3 - run 2 (record this one)
EXPLAIN (ANALYZE, BUFFERS)
SELECT ar.artist_id, ar.name, SUM(s.play_count) AS play_count
FROM monthly_track_stats s
JOIN track_artist ta ON ta.track_id = s.track_id AND ta.role = 'primary'
JOIN artist ar ON ar.artist_id = ta.artist_id
WHERE s.stat_month = date_trunc('month', CURRENT_DATE)::date
GROUP BY ar.artist_id, ar.name
ORDER BY play_count DESC
LIMIT 10;