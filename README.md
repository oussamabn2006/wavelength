# Spotify Data Platform

A Spotify-style music streaming platform built for the Data Platforms course (Option D: SQL catalog and
subscription plans, NoSQL playlists and stream-event logs, optimization of heavy analytical queries).

**Stack:** PostgreSQL 16 · Cassandra 5.0 · Kafka 4.4 · Redis 7 · MinIO · FastAPI · React + TypeScript · NGINX · Docker Compose

![Home](docs/screenshots/02-home.png)

## Architecture

![Architecture](docs/diagrams/01-architecture.png)

| Data | Technology | Why |
|---|---|---|
| Catalog, users, plans, subscriptions, payments | PostgreSQL | Relations, constraints, ACID transactions for money |
| Playlists, listening history, play counters | Cassandra | Write-heavy, read by one key (user and month) |
| Play events in transit | Kafka | API answers immediately (HTTP 202); a consumer writes to Cassandra |
| Hot analytical results | Redis | Cache-aside for expensive aggregations |
| Audio files and covers | MinIO | Object storage; the database keeps only the object key |

More diagrams (ERD, Cassandra tables, event flow, subscription states) are in [`docs/diagrams/`](docs/diagrams).

## Features

- **Guest mode, like Spotify:** without an account you can browse Home, Search, Charts, artists and albums.
  Playing, liking, creating playlists and opening your library ask you to log in or sign up.
- **Listening:** persistent player (progress, volume, shuffle, repeat, shortcuts), queue, recently played,
  listening history, Liked Songs, playlists.
- **Your stats and Charts:** minutes listened, top artists and songs, listening by hour and weekday; platform Top 50.
- **Subscriptions and billing:** plans, simulated payment gateway with test cards, proration, scheduled
  downgrade/cancel, failed-payment retries, refunds, receipts. The Free plan limits skips (6 per hour).
- **Accounts:** sign-up and login (PBKDF2 password hashing, signed session tokens).

## Run it

Requirements: Docker Desktop (WSL2 on Windows), Git, about 8 GB of free memory.

```powershell
git clone <repo-url>
cd spotify-data-platform
copy .env.example .env          # edit the passwords and set AUTH_SECRET
docker compose up -d --build
```

First run only (do not repeat on a populated database):

```powershell
docker compose exec backend python -m app.database.seed
docker compose exec backend python -m app.database.seed_cassandra
docker compose exec backend python -m app.database.seed_media
docker compose exec backend python -m app.database.set_demo_passwords 5 demo1234
```

Wait about a minute for Cassandra, then open http://localhost:8080 and log in with one of the emails printed by
the last command and the password `demo1234` (or sign up).

| URL | What |
|---|---|
| http://localhost:8080 | The app (NGINX) |
| http://localhost:8000/docs | API documentation |
| http://localhost:9001 | MinIO console |

Test cards for the payment form: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined.

## Project layout

```
app/          FastAPI backend: routers/, services/, database/, workers/, sql/ (.sql files), cql/ (.cql files)
frontend/     React + TypeScript + Vite + Tailwind
nginx/        Reverse proxy config (Dockerfile.nginx builds the React app into it)
scripts/      Benchmarks, billing test, evidence and screenshot collectors
docs/         Diagrams, benchmark output, evidence, demo script
```

## Optimization results

Warm timings on the full dataset (100,000 tracks, 600,000 monthly statistics, about 500,000 Cassandra events).

| Query | Before | After | Technique |
|---|---|---|---|
| Top 10 tracks of the month | 14.1 ms | 1.07 ms | B-tree index (stat_month, play_count DESC) |
| Track title search | 30.8 ms | 0.38 ms | GIN trigram index |
| Top 10 artists | 51.8 ms | 0.02 ms | Materialized view |
| `top-artists` API | 42.0 ms | 12.3 ms | Redis cache (96.8% hit ratio) |

Cassandra SAI index on `track_id` was **slower** (1.26 ms to 4.15 ms): reported as measured, an index is a trade-off.

Reproduce: `scripts\benchmark.ps1`, `scripts\benchmark_cache.ps1`. Collect resource evidence with
`scripts\collect_evidence.ps1`. Raw output is in [`docs/benchmarks/`](docs/benchmarks).

## Limitations

- Single-node Cassandra and Kafka (replication factor 1): distributed design, non-distributed deployment.
- The payment gateway is simulated; no real card data is handled.
- Login is enforced in the interface; the API endpoints themselves are not protected.
- Liked Songs are stored per user in the browser, not in a database table.

