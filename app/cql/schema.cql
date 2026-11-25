-- Applied automatically when the backend starts (IF NOT EXISTS), or manually through cqlsh.
-- Each table serves exactly one query. The same data is deliberately duplicated across tables.

CREATE KEYSPACE IF NOT EXISTS spotify
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

-- A user's recent plays. The month in the partition key keeps partitions bounded.
CREATE TABLE IF NOT EXISTS spotify.listening_history_by_user (
    user_id int,
    month text,
    event_id timeuuid,
    track_id int,
    track_title text,
    artist_names text,
    album_title text,
    duration_ms int,
    ms_played int,
    played_at timestamp,
    PRIMARY KEY ((user_id, month), event_id)
) WITH CLUSTERING ORDER BY (event_id DESC);

-- Live play counts per track and month.
CREATE TABLE IF NOT EXISTS spotify.track_plays_by_month (
    stat_month text,
    track_id int,
    plays counter,
    PRIMARY KEY ((stat_month), track_id)
);

-- Playlists of a user, newest first.
CREATE TABLE IF NOT EXISTS spotify.playlists_by_user (
    user_id int,
    playlist_id timeuuid,
    name text,
    description text,
    created_at timestamp,
    PRIMARY KEY ((user_id), playlist_id)
) WITH CLUSTERING ORDER BY (playlist_id DESC);

-- Playlist lookup by id.
CREATE TABLE IF NOT EXISTS spotify.playlists_by_id (
    playlist_id timeuuid PRIMARY KEY,
    user_id int,
    name text,
    description text,
    created_at timestamp
);

-- Ordered tracks of a playlist.
CREATE TABLE IF NOT EXISTS spotify.playlist_tracks (
    playlist_id timeuuid,
    track_position int,
    track_id int,
    track_title text,
    artist_names text,
    duration_ms int,
    added_at timestamp,
    PRIMARY KEY ((playlist_id), track_position)
);