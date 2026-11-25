"""Populate Cassandra with mock listening history and playlists.
Reads user and track data from PostgreSQL, so run the Postgres seed first.

    python -m app.database.seed_cassandra --small
    python -m app.database.seed_cassandra            # ~500k events
    python -m app.database.seed_cassandra --reset    # truncate the Cassandra tables first
"""
import argparse
import random
from collections import Counter
from datetime import datetime, timedelta, timezone
from itertools import accumulate

from cassandra.concurrent import execute_concurrent_with_args
from cassandra.util import uuid_from_time
from faker import Faker

from app.database import cassandra_db as cass
from app.database.postgres import SessionLocal
from app.database.sqlfiles import CQL_DIR, sql

fake = Faker()
Faker.seed(7)
random.seed(7)
CONCURRENCY = 25
FLUSH_AT = 5000


def load_from_postgres(pool_size: int):
    with SessionLocal() as s:
        user_ids = [r[0] for r in s.execute(sql("seed_user_ids"))]
        max_tid = s.execute(sql("seed_max_track_id")).scalar()
        if not user_ids or not max_tid:
            raise SystemExit("No users/tracks in PostgreSQL: run app.database.seed first")
        # Track 1 goes first = rank 1 = the most played track, so benchmark scripts can rely on it.
        ids = [1] + random.sample(range(2, max_tid + 1), min(pool_size, max_tid) - 1)
        rows = s.execute(sql("seed_track_pool"), {"ids": ids}).all()
    by_id = {r.track_id: dict(r._mapping) for r in rows}
    return user_ids, [by_id[i] for i in ids if i in by_id]


def run(session, stmt, args):
    if args:
        execute_concurrent_with_args(session, stmt, args, concurrency=CONCURRENCY, raise_on_first_error=True)
        args.clear()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--small", action="store_true")
    p.add_argument("--events-per-user", type=int)
    p.add_argument("--reset", action="store_true")
    a = p.parse_args()
    events_per_user = a.events_per_user or (30 if a.small else 50)
    pool_size = 1000 if a.small else 5000

    session = cass.connect(retries=5)
    if a.reset:
        cass.run_script(session, CQL_DIR / "maintenance" / "truncate_all.cql")

    user_ids, pool = load_from_postgres(pool_size)
    cum = list(accumulate(1 / (i + 1) for i in range(len(pool))))  # a few hits, a long tail

    insert_history = cass.prepared("insert_history")
    now = datetime.now(timezone.utc)
    args, counts, total = [], Counter(), 0
    for uid in user_ids:
        n = random.randint(events_per_user // 2, events_per_user * 3 // 2)
        for t in random.choices(pool, cum_weights=cum, k=n):
            ts = now - timedelta(seconds=random.randint(0, 90 * 86400))
            month = ts.strftime("%Y-%m")
            ms = t["duration_ms"] if random.random() < 0.7 else random.randint(5000, t["duration_ms"])
            args.append((uid, month, uuid_from_time(ts), t["track_id"], t["title"], t["artist_names"],
                         t["album_title"], t["duration_ms"], ms, ts))
            counts[(month, t["track_id"])] += 1
            total += 1
        if len(args) >= FLUSH_AT:
            run(session, insert_history, args)
    run(session, insert_history, args)
    print(f"History: {total} events for {len(user_ids)} users")

    run(session, cass.prepared("increment_plays"),
        [(c, month, tid) for (month, tid), c in counts.items()])
    print(f"Counters: {len(counts)} (month, track) rows. Most played: track {pool[0]['track_id']}")

    # Playlists for every 10th user
    pl_user = cass.prepared("insert_playlist_by_user")
    pl_id = cass.prepared("insert_playlist_by_id")
    pl_track = cass.prepared("insert_playlist_track")
    n_playlists = 0
    for uid in user_ids[::10]:
        for _ in range(random.randint(1, 3)):
            created = now - timedelta(days=random.randint(0, 60))
            pid = uuid_from_time(created)
            name = " ".join(fake.words(nb=2)).title()
            run(session, pl_user, [(uid, pid, name, None, created)])
            run(session, pl_id, [(pid, uid, name, None, created)])
            tracks = random.sample(pool, random.randint(5, min(20, len(pool))))
            run(session, pl_track, [
                (pid, pos, t["track_id"], t["title"], t["artist_names"], t["duration_ms"], created)
                for pos, t in enumerate(tracks, 1)
            ])
            n_playlists += 1
    print(f"Playlists: {n_playlists}")
    print("Done.")


if __name__ == "__main__":
    main()