-- Named queries loaded by app/database/sqlfiles.py.
-- Format: a line "-- name: foo", then the statement. Comment lines are stripped before execution.
-- Bind parameters use :name (SQLAlchemy). Do not write a colon followed by a word inside comments.

-- name: ping
SELECT 1 AS ok;

-- name: search_tracks
-- Title search plus artist names. The CTE filters and paginates first, then joins.
-- The unindexed ILIKE is the baseline for the benchmark; ix_track_title_trgm speeds it up.
WITH matched AS (
    SELECT track_id, album_id, title, duration_ms
    FROM track
    WHERE title ILIKE :pattern
    ORDER BY track_id
    LIMIT :limit OFFSET :offset
)
SELECT m.track_id, m.title, m.duration_ms,
       al.album_id, al.title AS album_title,
       COALESCE(string_agg(ar.name, ', ' ORDER BY (ta.role <> 'primary'), ar.name), '') AS artists
FROM matched m
JOIN album al ON al.album_id = m.album_id
LEFT JOIN track_artist ta ON ta.track_id = m.track_id
LEFT JOIN artist ar ON ar.artist_id = ta.artist_id
GROUP BY m.track_id, m.title, m.duration_ms, al.album_id, al.title
ORDER BY m.track_id;

-- name: get_track
-- One track with album and artists. Also used to denormalize rows written to Cassandra.
SELECT t.track_id, t.title, t.duration_ms,
       al.album_id, al.title AS album_title,
       COALESCE(string_agg(ar.name, ', ' ORDER BY (ta.role <> 'primary'), ar.name), '') AS artists
FROM track t
JOIN album al ON al.album_id = t.album_id
LEFT JOIN track_artist ta ON ta.track_id = t.track_id
LEFT JOIN artist ar ON ar.artist_id = ta.artist_id
WHERE t.track_id = :track_id
GROUP BY t.track_id, t.title, t.duration_ms, al.album_id, al.title;

-- name: top_tracks_by_month
-- Reads the pre-aggregated monthly_track_stats table.
SELECT t.track_id, t.title, s.play_count
FROM monthly_track_stats s
JOIN track t ON t.track_id = s.track_id
WHERE s.stat_month = :stat_month
ORDER BY s.play_count DESC
LIMIT :limit;

-- name: top_artists_by_month
-- Aggregates plays of each artist's primary tracks.
SELECT ar.artist_id, ar.name, SUM(s.play_count) AS play_count
FROM monthly_track_stats s
JOIN track_artist ta ON ta.track_id = s.track_id AND ta.role = 'primary'
JOIN artist ar ON ar.artist_id = ta.artist_id
WHERE s.stat_month = :stat_month
GROUP BY ar.artist_id, ar.name
ORDER BY play_count DESC
LIMIT :limit;

-- name: revenue_by_plan
SELECT p.name AS plan_name,
       COUNT(pay.payment_id) FILTER (WHERE pay.status = 'succeeded') AS payments,
       COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'succeeded'), 0) AS revenue
FROM plan p
JOIN subscription s ON s.plan_id = p.plan_id
LEFT JOIN payment pay ON pay.subscription_id = s.subscription_id
GROUP BY p.plan_id, p.name
ORDER BY revenue DESC;

-- Seed helpers (used by seed_cassandra.py)

-- name: seed_user_ids
SELECT user_id FROM app_user ORDER BY user_id;

-- name: seed_max_track_id
SELECT MAX(track_id) FROM track;

-- name: seed_track_pool
SELECT t.track_id, t.title, t.duration_ms, al.title AS album_title,
       COALESCE(string_agg(ar.name, ', ' ORDER BY (ta.role <> 'primary'), ar.name), '') AS artist_names
FROM track t
JOIN album al ON al.album_id = t.album_id
LEFT JOIN track_artist ta ON ta.track_id = t.track_id
LEFT JOIN artist ar ON ar.artist_id = ta.artist_id
WHERE t.track_id = ANY(:ids)
GROUP BY t.track_id, t.title, t.duration_ms, al.title;

-- Maintenance

-- name: reset_sequences
-- Re-aligns every id sequence after bulk inserts with explicit ids.
SELECT
    setval(pg_get_serial_sequence('record_label', 'label_id'),  COALESCE((SELECT MAX(label_id) FROM record_label), 1)),
    setval(pg_get_serial_sequence('artist', 'artist_id'),       COALESCE((SELECT MAX(artist_id) FROM artist), 1)),
    setval(pg_get_serial_sequence('genre', 'genre_id'),         COALESCE((SELECT MAX(genre_id) FROM genre), 1)),
    setval(pg_get_serial_sequence('album', 'album_id'),         COALESCE((SELECT MAX(album_id) FROM album), 1)),
    setval(pg_get_serial_sequence('track', 'track_id'),         COALESCE((SELECT MAX(track_id) FROM track), 1)),
    setval(pg_get_serial_sequence('app_user', 'user_id'),       COALESCE((SELECT MAX(user_id) FROM app_user), 1)),
    setval(pg_get_serial_sequence('plan', 'plan_id'),           COALESCE((SELECT MAX(plan_id) FROM plan), 1)),
    setval(pg_get_serial_sequence('subscription', 'subscription_id'), COALESCE((SELECT MAX(subscription_id) FROM subscription), 1)),
    setval(pg_get_serial_sequence('payment_method', 'method_id'), COALESCE((SELECT MAX(method_id) FROM payment_method), 1)),
    setval(pg_get_serial_sequence('payment', 'payment_id'),     COALESCE((SELECT MAX(payment_id) FROM payment), 1));

-- Cache invalidation: retrieve every track associated with an artist.
-- name: track_ids_by_artist
SELECT track_id
FROM track_artist
WHERE artist_id = :artist_id;

-- name: playable_tracks
-- Tracks that have audio uploaded, for the player and the UI.
SELECT t.track_id, t.title, t.duration_ms,
       al.album_id, al.title AS album_title,
       COALESCE(string_agg(ar.name, ', ' ORDER BY (ta.role <> 'primary'), ar.name), '') AS artists
FROM track t
JOIN album al ON al.album_id = t.album_id
LEFT JOIN track_artist ta ON ta.track_id = t.track_id
LEFT JOIN artist ar ON ar.artist_id = ta.artist_id
WHERE t.audio_object_key IS NOT NULL
GROUP BY t.track_id, t.title, t.duration_ms, al.album_id, al.title
ORDER BY t.track_id
LIMIT :limit;

-- name: album_ids_for_tracks
SELECT DISTINCT album_id FROM track WHERE track_id = ANY(:ids);

-- name: search_albums
-- Filters and paginates first, then joins artists. Uses the trigram index on album titles.
WITH matched AS (
    SELECT album_id, title, album_type, release_date
    FROM album
    WHERE title ILIKE :pattern
    ORDER BY album_id
    LIMIT :limit OFFSET :offset
)
SELECT m.album_id, m.title, m.album_type, m.release_date,
       COALESCE(string_agg(ar.name, ', ' ORDER BY ar.name), '') AS artists
FROM matched m
LEFT JOIN album_artist aa ON aa.album_id = m.album_id
LEFT JOIN artist ar ON ar.artist_id = aa.artist_id
GROUP BY m.album_id, m.title, m.album_type, m.release_date
ORDER BY m.album_id;

-- name: user_payments
SELECT pay.payment_id, pay.subscription_id,
       COALESCE(pp.name, sp.name) AS plan_name,
       pay.amount, pay.currency, pay.method, pay.status, pay.paid_at,
       pay.reason, pay.failure_code, pay.failure_message, pay.refunded_at,
       pay.period_start, pay.period_end,
       pm.brand, pm.last4,
       (pay.status = 'succeeded' AND pay.paid_at >= now() - interval '14 days') AS refundable
FROM payment pay
JOIN subscription s ON s.subscription_id = pay.subscription_id
JOIN plan sp ON sp.plan_id = s.plan_id
LEFT JOIN plan pp ON pp.plan_id = pay.plan_id
LEFT JOIN payment_method pm ON pm.method_id = pay.payment_method_id
WHERE s.user_id = :user_id
ORDER BY pay.paid_at DESC, pay.payment_id DESC
LIMIT :limit;

-- name: user_subscriptions
SELECT s.subscription_id,
       p.name AS plan_name,
       s.status,
       s.start_date,
       s.end_date
FROM subscription s
JOIN plan p ON p.plan_id = s.plan_id
WHERE s.user_id = :user_id
ORDER BY s.start_date DESC, s.subscription_id DESC
LIMIT :limit;

-- name: due_billing
-- Subscriptions that need billing work as of a date: renewals that are due and past-due retries.
-- Served by the partial indexes ix_sub_renewal_due and ix_sub_retry_due.
SELECT subscription_id
FROM subscription
WHERE ((status = 'active' AND current_period_end <= :as_of)
    OR (status = 'past_due' AND next_retry_date <= :as_of))
  AND (CAST(:user_id AS integer) IS NULL OR user_id = CAST(:user_id AS integer))
ORDER BY subscription_id
LIMIT :limit;