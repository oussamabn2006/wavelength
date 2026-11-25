-- Run this file twice: before and after 02_create_sai_index.cql.
-- In each trace, the last event ("Request complete") shows the elapsed time in microseconds.
-- Track 1 is the most played track in the seeded data. Edit the month if you run this after November 2026.
-- Use the full seed: on a tiny dataset every query takes about the same time.
TRACING ON;

-- Q1: partition read, a user's recent plays (run twice, record the second)
SELECT event_id, track_title, played_at FROM spotify.listening_history_by_user WHERE user_id = 1 AND month = '2026-11' LIMIT 20;
SELECT event_id, track_title, played_at FROM spotify.listening_history_by_user WHERE user_id = 1 AND month = '2026-11' LIMIT 20;

-- Q2: counter read, plays of track 1 this month, served by a purpose-built table
SELECT plays FROM spotify.track_plays_by_month WHERE stat_month = '2026-11' AND track_id = 1;
SELECT plays FROM spotify.track_plays_by_month WHERE stat_month = '2026-11' AND track_id = 1;

-- Q3: search listening history by track_id using SAI
SELECT user_id, month, event_id, track_title, played_at
FROM spotify.listening_history_by_user
WHERE track_id = 1
LIMIT 20;

SELECT user_id, month, event_id, track_title, played_at
FROM spotify.listening_history_by_user
WHERE track_id = 1
LIMIT 20;

TRACING OFF;