# Cricket Analytics Database

A minimal, dockerized Postgres containing a curated analytics schema built from
the upstream cricket ingest DB. Designed for Lightboard agents to query
efficiently — consistent naming, few joins, no redundancy, IPL + Men's T20I
only with normalized series labels.

## What's in here

- `docker-compose.yml` — Postgres 16-alpine on port **5436**
- `schema.sql` — DDL for the `analytics` schema (8 tables + indexes)
- `transform.sql` — pulls data from the source DB via `postgres_fdw`, applies
  format classification, series normalization, dismissal-code mapping, phase
  derivation, and inlines `delivery_xruns` into `deliveries`
- `verify.sql` — row counts, orphan-FK checks, and four sample analytical
  queries that should return non-empty results
- `migrate.sh` — one-shot orchestrator

## Prerequisites

- Docker Desktop running on the host
- The **source** cricket DB container is up and exposing port **5434**
  (`docker ps` should show a container publishing `0.0.0.0:5434->5432/tcp`).
  The transform connects to it via `host.docker.internal:5434` with credentials
  `cricket_user` / `cricket_pass`, database `cricket`.

## Usage

```bash
cd docker/cricket-analytics
./migrate.sh                # first run — builds fresh DB and populates it
./migrate.sh --reset        # wipe the volume and rebuild from scratch
./migrate.sh --skip-verify  # skip the verification report
```

A full migration takes ~1–3 minutes (bulk of the time is pulling ~1M
deliveries rows through FDW).

## Schema at a glance

All tables live in the `analytics` schema. Connection string for Lightboard:

```
postgres://cricket_user:cricket_pass@localhost:5436/cricket_analytics
```

| Table                 | Grain                              |
|-----------------------|------------------------------------|
| `players`             | One row per player (bio + style)   |
| `teams`               | One row per team                   |
| `venues`              | One row per ground                 |
| `matches`             | One row per match (IPL or T20I)    |
| `innings`             | One row per innings (match × 1/2)  |
| `batting_scorecards`  | One row per batter per innings     |
| `bowling_scorecards`  | One row per bowler per innings     |
| `deliveries`          | One row per ball, xRuns inlined    |

Key conventions:
- **IDs**: `player_id`, `team_id`, `venue_id` all use source `object_id` values
  so the cross-table join convention stays consistent.
- **`match_format`**: exactly two values — `'IPL'` or `'T20I'`.
- **`tournament_label`**: for IPL, always `'IPL <year>'` regardless of sponsor
  era (no `Pepsi`, `DLF`, `Vivo`, `TATA` prefixes). For T20I it's the
  tournament name from upstream (e.g. `ICC Men's T20 World Cup`).
- **`phase`** on `deliveries`: `'powerplay'` (overs 1–6), `'middle'` (7–15),
  `'death'` (16–20).
- **`dismissal_type`**: decoded from numeric codes to short text
  (`'caught'`, `'bowled'`, `'lbw'`, `'run out'`, `'stumped'`, …).
- **xRuns** (`xruns`, `prob_0..prob_6`, `prob_wicket`): ML predictions from the
  upstream `delivery_xruns` table, inlined into `deliveries`. Nullable —
  coverage is roughly 30–40% (upstream model was trained on a subset).

## Scope

- **Included**: IPL matches (series name in `IPL`, `Indian Premier League`,
  `Pepsi Indian Premier League`) and Men's T20I matches
  (`international_class_id=3`) that have actual ball-by-ball data (`stage =
  'FINISHED'` and at least one delivery row).
- **Excluded**: ODI, TEST, domestic T20 (BBL, CPL, Hundred, etc.), women's
  cricket, abandoned matches, scheduled/future matches.

## Registering with Lightboard

1. Run `./migrate.sh` and confirm `verify.sql` passes.
2. In the Lightboard UI, add a data source with the connection string above.
3. Trigger schema bootstrap — Lightboard introspects `analytics.*` and the
   agent regenerates its schema doc.

## Rebuilding

Every run of `./migrate.sh` truncates the analytics tables before reinserting,
so running it again picks up fresh data from the source. Use `--reset` only
when you want to also drop the docker volume (fastest way to start from zero).
