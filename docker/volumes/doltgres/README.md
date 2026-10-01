# Local Doltgres trial

This override runs the existing Supabase services against Doltgres with debug
logging, with Realtime, logical replication, SQL cryptography, query statistics,
and database webhooks disabled. Bootstrap stops at the first remaining SQL error;
the complete stack has not yet been validated against Doltgres.

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
`NEXT_PUBLIC_DISABLED_FEATURES=realtime:all,database:replication,database:query_statistics,database:webhooks,database:sql_crypto`. This disables
publication queries and mutations, per-table Realtime controls, and Realtime and
replication pages. The adapter removes the initial `CREATE PUBLICATION` statement
from the copied SQL and does not initialize `_realtime`. The Realtime service is
excluded from normal startup; Envoy returns HTTP 503 for Realtime endpoints.
Do not enable the `realtime-disabled` Compose profile.

Postgres Changes, database Broadcast, client Broadcast, and Presence are
unavailable. Other Doltgres compatibility errors still stop bootstrap.

For Studio development outside Docker, set
`NEXT_PUBLIC_DISABLED_FEATURES=realtime:all,database:replication,database:query_statistics,database:webhooks,database:sql_crypto` before starting
the dev server. The default PostgreSQL stack keeps replication enabled.

The base stack's fixed container names mean another self-hosted Compose stack
using those names must be stopped before starting this one. Supabase CLI stacks
with their own container names can coexist if their host ports do not conflict.

## Bootstrap and persistence

The Docker entrypoint invokes `bootstrap.sh` on first startup. It runs the pinned
image's init SQL as `postgres`, then migrations as `supabase_admin`, including the
existing SQL mounted from `docker/volumes/db`. Both bootstrap completion and an
authenticated query are required before database health succeeds.

Before the copied SQL runs, `predefined-roles.sql` creates missing non-login roles
for `pg_read_all_data`, `pg_monitor`, `pg_signal_backend`, and
`pg_create_subscription`. Existing server-provided roles are preserved. These
ordinary roles allow the bootstrap's membership grants to succeed; they do not
implement PostgreSQL's built-in read-all, monitoring, backend signaling, or
subscription privileges. Explicit object permissions are still required when
using these compatibility roles.

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

## Optional extension workarounds

The adapter installs `uuid-ossp` in `public` and omits `pgcrypto` and
`pg_stat_statements` installation. The `extensions` schema remains for Supabase's
helper functions. Doltgres 1.3.3 supplies `gen_random_uuid()` independently of
`pgcrypto`; application-side Auth password hashing is also independent.

Instead of initializing database webhooks, the override mounts
`disabled-webhooks.sql`, which preserves `supabase_functions_admin` for the later
password setup. It does not create `supabase_functions` or an HTTP trigger.

Studio hides the unavailable extensions and integrations, rejects their enable
mutations, and disables statistics queries, workload index suggestions, and
statistics-dependent templates. Direct integration and query performance routes
show an unavailable state. The default Postgres and hosted deployments retain
their capabilities.

SQL cryptography (`digest`, `hmac`, `crypt`, encryption, and random bytes), Query
Performance statistics, database webhooks, and HTTP calls from SQL are unavailable.
REST CRUD and ordinary RPC calls do not depend on these extensions. Custom SQL,
RPC functions, seeds, or triggers that call missing functions will still fail.
Edge Functions invoked directly and Auth HTTP hooks are independent of `pg_net`.
Cron itself is a separate extension requirement; disabling `pg_net` removes its
HTTP request functionality rather than providing a scheduler.

The extension-free trial passed `uuid-ossp` installation in `public`, then stopped
at `ALTER DEFAULT PRIVILEGES` in the initial schema: Doltgres 1.3.3 reports that
statement as unsupported. The webhook compatibility role and later migrations
have not yet been reached by a complete bootstrap.

## Previous startup result (1.0.0)

The earlier trial with Doltgres 1.0.0 started with debug logging, then stopped in
`00000000000000-initial-schema.sql` at:

```sql
create publication supabase_realtime;
```

Doltgres reported `syntax error: unimplemented: this syntax`. The database stayed
unhealthy. The adapter now uses 1.3.3 and removes this statement during the image
build. The released image also lacks predefined roles required by the copied SQL;
the adapter creates compatibility roles before those grants run. The bootstrap
runner still stops at any remaining SQL error.
