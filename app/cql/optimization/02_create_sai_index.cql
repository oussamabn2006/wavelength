-- Storage-Attached Index (Cassandra 5.0). It builds in the background on existing data.
CREATE INDEX IF NOT EXISTS history_track_idx
    ON spotify.listening_history_by_user (track_id) USING 'sai';