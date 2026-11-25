"""Populate PostgreSQL with realistic mock data (11 MLD tables + extensions).

Streams data in chunks, so memory stays low even for the full dataset.

    python -m app.database.seed --small     # quick test: 100 artists, 200 users, 2 stat months
    python -m app.database.seed             # full: ~100k tracks, 10k users, 6 stat months
    python -m app.database.seed --reset     # drop the whole schema and rebuild it first
"""
import argparse
import random
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from faker import Faker
from sqlalchemy import func, insert, select

from app.database import models as m
from app.database.postgres import Base, SessionLocal, engine
from app.database.sqlfiles import SQL_DIR, run_sql_script, sql

fake = Faker()
Faker.seed(42)
random.seed(42)

BATCH = 5000
ARTIST_CHUNK = 100   # artists processed per flush (~5,000 tracks with defaults)
USER_CHUNK = 5000

GENRES = ["Pop", "Rock", "Hip-Hop", "R&B", "Jazz", "Classical", "Electronic", "Country", "Reggae",
          "Blues", "Metal", "Folk", "Soul", "Latin", "Indie", "Punk", "Funk", "Ambient", "Gnawa", "Rai"]

# (plan_id, name, monthly_price, max_accounts, has_ads)
PLANS = [
    (1, "Free", Decimal("0.00"), 1, True),
    (2, "Premium Individual", Decimal("9.99"), 1, False),
    (3, "Premium Duo", Decimal("12.99"), 2, False),
    (4, "Premium Family", Decimal("15.99"), 6, False),
    (5, "Premium Student", Decimal("4.99"), 1, False),
]
PRICES = {p[0]: p[2] for p in PLANS}


def bulk(session, model, rows):
    """Insert rows in BATCH-sized executemany calls."""
    for i in range(0, len(rows), BATCH):
        session.execute(insert(model), rows[i:i + BATCH])


def month_starts(n: int) -> list[date]:
    d = date.today().replace(day=1)
    out = []
    for _ in range(n):
        out.append(d)
        d = (d - timedelta(days=1)).replace(day=1)
    return out


def seed_catalog(s, a, n_labels, n_genres):
    """Artists first (small), then albums/tracks streamed in chunks. Returns (albums, tracks) counts."""
    artists = [{"artist_id": i,
                "name": fake.name() if random.random() < 0.6 else f"The {fake.word().title()}s",
                "country": fake.country_code()}
               for i in range(1, a.artists + 1)]
    bulk(s, m.Artist, artists)
    s.commit()

    album_id = track_id = 0
    albums, album_artists, tracks, track_artists = [], [], [], []

    def flush():
        # Dependency order matters: albums -> junction -> tracks -> junction
        bulk(s, m.Album, albums)
        bulk(s, m.AlbumArtist, album_artists)
        bulk(s, m.Track, tracks)
        bulk(s, m.TrackArtist, track_artists)
        s.commit()
        albums.clear(); album_artists.clear(); tracks.clear(); track_artists.clear()

    for n, artist in enumerate(artists, 1):
        aid = artist["artist_id"]
        for _ in range(a.albums_per_artist):
            album_id += 1
            albums.append({
                "album_id": album_id,
                "label_id": random.randint(1, n_labels),
                "title": fake.sentence(nb_words=random.randint(1, 4)).rstrip("."),
                "album_type": random.choices(["album", "single", "ep", "compilation"],
                                             weights=[60, 15, 20, 5])[0],
                "release_date": fake.date_between("-15y", "today"),
            })
            album_artists.append({"album_id": album_id, "artist_id": aid})
            co_artist = None
            if random.random() < 0.15:  # collaboration album
                candidate = random.randint(1, a.artists)
                if candidate != aid:
                    co_artist = candidate
                    album_artists.append({"album_id": album_id, "artist_id": co_artist})
            for num in range(1, a.tracks_per_album + 1):
                track_id += 1
                tracks.append({
                    "track_id": track_id,
                    "album_id": album_id,
                    "genre_id": random.randint(1, n_genres),
                    "title": fake.sentence(nb_words=random.randint(1, 5)).rstrip("."),
                    "track_number": num,
                    "duration_ms": random.randint(90, 420) * 1000,
                    "is_explicit": random.random() < 0.1,
                })
                track_artists.append({"track_id": track_id, "artist_id": aid, "role": "primary"})
                feat = co_artist or (random.randint(1, a.artists) if random.random() < 0.1 else None)
                if feat and feat != aid:
                    track_artists.append({"track_id": track_id, "artist_id": feat, "role": "featured"})
        if n % ARTIST_CHUNK == 0:
            flush()
    flush()
    return album_id, track_id


def seed_users(s, n_users):
    """Users, subscriptions and payments, streamed in USER_CHUNK-sized chunks."""
    today = date.today()
    pay_id = 0
    for lo in range(1, n_users + 1, USER_CHUNK):
        hi = min(lo + USER_CHUNK - 1, n_users)
        users, subs, payments = [], [], []
        for uid in range(lo, hi + 1):
            users.append({
                "user_id": uid,
                "email": f"{uid}.{fake.user_name()}@{fake.free_email_domain()}",
                "display_name": fake.name()[:100],
                "password_hash": "!seeded-no-login",
                "is_active": True,
                "country": fake.country_code(),
                "birth_date": fake.date_of_birth(minimum_age=14, maximum_age=70),
            })
            plan_id = random.choices([1, 2, 3, 4, 5], weights=[40, 30, 10, 10, 10])[0]
            start = today - timedelta(days=random.randint(30, 730))
            status = "active" if plan_id == 1 else random.choices(
                ["active", "cancelled", "expired"], weights=[70, 15, 15])[0]
            end = None
            if status != "active":
                end = start + timedelta(days=random.randint(30, max(30, (today - start).days)))
            subs.append({"subscription_id": uid, "user_id": uid, "plan_id": plan_id,
                         "status": status, "start_date": start, "end_date": end})
            if plan_id != 1:
                for k in range(((end or today) - start).days // 30):
                    pay_id += 1
                    payments.append({
                        "payment_id": pay_id, "subscription_id": uid, "amount": PRICES[plan_id],
                        "currency": "USD", "method": random.choice(["card", "paypal"]),
                        "status": "succeeded" if random.random() < 0.95 else "failed",
                        "paid_at": datetime.combine(start + timedelta(days=30 * k), time(12),
                                                    tzinfo=timezone.utc),
                    })
        bulk(s, m.AppUser, users)
        bulk(s, m.Subscription, subs)
        bulk(s, m.Payment, payments)
        s.commit()


def seed_stats(s, n_tracks, n_months):
    """monthly_track_stats: generated and inserted in BATCH-sized slices, never held in full."""
    now = datetime.now(timezone.utc)
    total = 0
    for month in month_starts(n_months):
        for lo in range(1, n_tracks + 1, BATCH):
            rows = [{"stat_month": month, "track_id": tid,
                     "play_count": int(random.expovariate(1 / 2000)), "computed_at": now}
                    for tid in range(lo, min(lo + BATCH, n_tracks + 1))]
            s.execute(insert(m.MonthlyTrackStats), rows)
            total += len(rows)
        s.commit()
    return total


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--small", action="store_true", help="quick test dataset")
    p.add_argument("--users", type=int)
    p.add_argument("--artists", type=int)
    p.add_argument("--albums-per-artist", type=int, default=5)
    p.add_argument("--tracks-per-album", type=int, default=10)
    p.add_argument("--stat-months", type=int)
    p.add_argument("--reset", action="store_true")
    a = p.parse_args()

    a.users = a.users or (200 if a.small else 10_000)
    a.artists = a.artists or (100 if a.small else 2_000)
    a.stat_months = a.stat_months or (2 if a.small else 6)

    if a.reset:
        with engine.begin() as conn:
            run_sql_script(conn, SQL_DIR / "maintenance" / "reset_schema.sql")
    Base.metadata.create_all(engine)

    with SessionLocal() as s:
        if s.scalar(select(func.count()).select_from(m.Artist)):
            print("Database already seeded. Use --reset to start over.")
            return

        # Reference data
        labels = [{"label_id": i, "name": f"{fake.company()} Records #{i}"[:120],
                   "country": fake.country_code(), "founded_year": random.randint(1950, 2020)}
                  for i in range(1, 51)]
        bulk(s, m.RecordLabel, labels)
        bulk(s, m.Genre, [{"genre_id": i, "name": n} for i, n in enumerate(GENRES, 1)])
        bulk(s, m.Plan, [{"plan_id": i, "name": n, "monthly_price": pr, "max_accounts": acc, "has_ads": ads}
                         for i, n, pr, acc, ads in PLANS])
        s.commit()

        n_albums, n_tracks = seed_catalog(s, a, len(labels), len(GENRES))
        print(f"Catalog: {a.artists} artists, {n_albums} albums, {n_tracks} tracks")

        seed_users(s, a.users)
        print(f"Users: {a.users} (with subscriptions and payments)")

        n_stats = seed_stats(s, n_tracks, a.stat_months)
        print(f"Stats: {n_stats} monthly_track_stats rows")

        run_sql_script(s, SQL_DIR / "migrations" / "002_billing_backfill.sql")
        s.commit()
        s.execute(sql("reset_sequences"))
        s.commit()
        print("Done.")


if __name__ == "__main__":
    main()