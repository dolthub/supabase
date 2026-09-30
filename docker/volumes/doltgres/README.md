# Local Doltgres trial

This override runs the existing Supabase services against Doltgres with debug
logging, with Realtime and logical replication disabled. It assumes PostgreSQL compatibility, including the extensions used by
the pinned Supabase bootstrap SQL. Bootstrap stops at the first SQL error.

The adapter image copies SQL from `supabase/postgres:17.6.1.136` and runs it against
`dolthub/doltgresql:1.3.3`. It keeps the existing service roles, `db:5432`, and the
`postgres` and `_supabase` database names. No PostgreSQL server runs in the adapter.

## Build and start

From `docker/`, create `.env` if it does not already exist:

```sh
cp .env.example .env
```

Keep `POSTGRES_HOST=db`, `POSTGRES_PORT=5432`, and `POSTGRES_DB=postgres` for this
trial. Configure the other values as for the base Docker stack.

```sh
docker compose -f docker-compose.yml -f docker-compose.doltgres.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.doltgres.yml logs -f db
```

Studio is available through the gateway at `http://localhost:8000`, using
`DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` from `.env`.

The override builds Studio with
`NEXT_PUBLIC_DISABLED_FEATURES=realtime:all,database:replication`. This disables
publication queries and mutations, per-table Realtime controls, and Realtime and
replication pages. The adapter removes the initial `CREATE PUBLICATION` statement
from the copied SQL and does not initialize `_realtime`. The Realtime service is
excluded from normal startup; Envoy returns HTTP 503 for Realtime endpoints.
Do not enable the `realtime-disabled` Compose profile.

Postgres Changes, database Broadcast, client Broadcast, and Presence are
unavailable. Other Doltgres compatibility errors still stop bootstrap.

For Studio development outside Docker, set
`NEXT_PUBLIC_DISABLED_FEATURES=realtime:all,database:replication` before starting
the dev server. The default PostgreSQL stack keeps replication enabled.

The base stack's fixed container names mean another self-hosted Compose stack
using those names must be stopped before starting this one. Supabase CLI stacks
with their own container names can coexist if their host ports do not conflict.

## Bootstrap and persistence

The Docker entrypoint invokes `bootstrap.sh` on first startup. It runs the pinned
image's init SQL as `postgres`, then migrations as `supabase_admin`, including the
existing SQL mounted from `docker/volumes/db`. Both bootstrap completion and an
authenticated query are required before database health succeeds.

The `doltgres-data` named volume persists databases, authentication state, and
initialization markers under `/var/lib/doltgres`. The override replaces the base
database mounts; it does not use `volumes/db/data` or the Postgres key volume.

After a failed bootstrap, inspect the debug logs and fix the reported error. A
partially initialized database is not retried automatically. To remove only the
trial database volume, stop the stack, then remove its volume:

```sh
docker compose -f docker-compose.yml -f docker-compose.doltgres.yml down
docker volume rm supabase_doltgres-data
```

The volume name above assumes the default Compose project name `supabase`.
Removing it deletes the trial database. Do not use `docker/reset.sh` for this
override: it targets the standard Postgres development configuration.

This setup does not change `supabase start`, `pnpm dev:studio-local`, or the
CLI-backed E2E environment.

## Previous startup result (1.0.0)

The earlier trial with Doltgres 1.0.0 started with debug logging, then stopped in
`00000000000000-initial-schema.sql` at:

```sql
create publication supabase_realtime;
```

Doltgres reported `syntax error: unimplemented: this syntax`. The database stayed
unhealthy. The adapter now uses 1.3.3 and removes this statement during the image
build. A fresh trial passed that point and stopped at the grant of
`pg_read_all_data`, which is absent in the released image. The bootstrap runner
still stops at any remaining SQL error.
