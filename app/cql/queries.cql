-- Named prepared statements loaded by app/database/sqlfiles.py. Positional ? markers.

-- name: insert_history
INSERT INTO spotify.listening_history_by_user
    (user_id, month, event_id, track_id, track_title, artist_names, album_title, duration_ms, ms_played, played_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: select_history
SELECT event_id, track_id, track_title, artist_names, album_title, duration_ms, ms_played, played_at
FROM spotify.listening_history_by_user
WHERE user_id = ? AND month = ?
LIMIT ?;

-- name: increment_plays
UPDATE spotify.track_plays_by_month SET plays = plays + ? WHERE stat_month = ? AND track_id = ?;

-- name: select_plays
SELECT plays FROM spotify.track_plays_by_month WHERE stat_month = ? AND track_id = ?;

-- name: insert_playlist_by_user
INSERT INTO spotify.playlists_by_user (user_id, playlist_id, name, description, created_at)
VALUES (?, ?, ?, ?, ?);

-- name: insert_playlist_by_id
INSERT INTO spotify.playlists_by_id (playlist_id, user_id, name, description, created_at)
VALUES (?, ?, ?, ?, ?);

-- name: select_playlist_by_id
SELECT playlist_id, user_id, name, description, created_at
FROM spotify.playlists_by_id WHERE playlist_id = ?;

-- name: select_playlists_by_user
SELECT playlist_id, user_id, name, description, created_at
FROM spotify.playlists_by_user WHERE user_id = ?;

-- name: insert_playlist_track
INSERT INTO spotify.playlist_tracks
    (playlist_id, track_position, track_id, track_title, artist_names, duration_ms, added_at)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: insert_playlist_track_if_absent
-- Lightweight transaction: only applied if nobody took this position first.
INSERT INTO spotify.playlist_tracks
    (playlist_id, track_position, track_id, track_title, artist_names, duration_ms, added_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
IF NOT EXISTS;

-- name: select_max_position
SELECT track_position FROM spotify.playlist_tracks
WHERE playlist_id = ? ORDER BY track_position DESC LIMIT 1;

-- name: select_playlist_tracks
SELECT track_position, track_id, track_title, artist_names, duration_ms, added_at
FROM spotify.playlist_tracks WHERE playlist_id = ?;

-- name: delete_playlist_track
DELETE FROM spotify.playlist_tracks WHERE playlist_id = ? AND track_position = ?;

-- name: cassandra_version
SELECT release_version FROM system.local;

-- name: insert_history_if_absent
-- Idempotent write for the Kafka consumer: applied only if this event_id was not stored yet.
INSERT INTO spotify.listening_history_by_user
    (user_id, month, event_id, track_id, track_title, artist_names, album_title, duration_ms, ms_played, played_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
IF NOT EXISTS;

-- name: select_history_event
SELECT event_id, track_title, played_at
FROM spotify.listening_history_by_user
WHERE user_id = ? AND month = ? AND event_id = ?;


-- name: track_ids_by_artist
-- Used to invalidate cached track entries when an artist changes.
SELECT DISTINCT track_id FROM track_artist WHERE artist_id = :artist_id;