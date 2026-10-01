# Local Doltgres trial

This override runs the existing Supabase services against Doltgres with debug
logging, with Realtime, logical replication, SQL cryptography, query statistics,
database webhooks, and event triggers disabled. Bootstrap stops at the first remaining SQL error;
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
`NEXT_PUBLIC_DISABLED_FEATURES=realtime:all,database:replication,database:query_statistics,database:webhooks,database:sql_crypto,database:event_triggers`. This disables
publication queries and mutations, per-table Realtime controls, and Realtime and
replication pages. The adapter removes the initial `CREATE PUBLICATION` statement
from the copied SQL and does not initialize `_realtime`. The Realtime service is
excluded from normal startup; Envoy returns HTTP 503 for Realtime endpoints.
Do not enable the `realtime-disabled` Compose profile.

Postgres Changes, database Broadcast, client Broadcast, and Presence are
unavailable. Other Doltgres compatibility errors still stop bootstrap.

For Studio development outside Docker, set
`NEXT_PUBLIC_DISABLED_FEATURES=realtime:all,database:replication,database:query_statistics,database:webhooks,database:sql_crypto,database:event_triggers` before starting
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

## Default privilege workaround

The adapter rewrites the copied bootstrap's schema-scoped
`ALTER DEFAULT PRIVILEGES ... GRANT ALL` statements into
`GRANT ALL ON ALL TABLES`, `SEQUENCES`, `FUNCTIONS`, or `ROUTINES IN SCHEMA`.
Multiline statements and grants inside helper functions are included; recipient
roles and `WITH GRANT OPTION` are preserved. The image build fails if an
unsupported default-privilege statement remains. Mounted self-hosted SQL is
unchanged; the active mounts contain no default-privilege statements.

In Doltgres 1.3.3 these grants apply to existing and future objects throughout the
schema. They are broader than PostgreSQL defaults: `FOR USER`/`FOR ROLE` creator
scope is dropped, and an individual object's `REVOKE` does not override the
schema-wide grant. This is a development workaround, not equivalent PostgreSQL
permission behavior. The standard Postgres image and initialization are unchanged.

From the repository root, run the rewrite checks with:

```sh
python3 docker/volumes/doltgres/test_default_privileges.py
```

## Role configuration workaround

Doltgres 1.3.3 rejects `ALTER USER/ROLE ... SET`. The adapter removes the copied
bootstrap's known role-setting statements during the image build and defines
their final defaults in `config.yaml` under `user_session_vars`. Unknown
role-setting statements fail the build instead of being silently discarded.
Active mounted SQL contains no role-setting statements.

| Role                      | Search path                         | Other defaults                                           |
| ------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `postgres`                | `"$user", public, extensions`       |                                                          |
| `supabase_admin`          | `"$user", public, auth, extensions` | `log_statement=none`                                     |
| `supabase_auth_admin`     | `auth`                              | Idle transaction timeout: 60000 ms; `log_statement=none` |
| `supabase_storage_admin`  | `storage`                           | `log_statement=none`                                     |
| `anon`                    | Server default                      | Statement timeout: 3000 ms                               |
| `authenticated`           | Server default                      | Statement timeout: 8000 ms                               |
| `authenticator`           | Server default                      | Statement and lock timeouts: 8000 ms                     |
| `supabase_read_only_user` | Server default                      | `default_transaction_read_only=on`                       |

These defaults apply to new physical connections, including roles created after
server startup. Existing connections keep their settings; restart the database
after editing the config. A session-level `SET` can override the default for that
connection. Defaults are persisted through the mounted YAML rather than SQL
catalog settings, so they are not equivalent to role settings for introspection,
database-specific defaults, or PostgREST's catalog-based role-setting lookup.

The adapter omits `session_preload_libraries=safeupdate` and
`session_preload_libraries=supautils,safeupdate`: PostgreSQL shared libraries cannot
be loaded into Doltgres. The safeupdate library's protection against `UPDATE` or
`DELETE` without a `WHERE` clause is therefore unavailable. Doltgres debug logging
remains enabled; `log_statement=none` does not replace `log_level: debug`.
Connection checks verify the configured values, not PostgreSQL-equivalent timeout
or read-only enforcement by Doltgres.

The role-setting trial passed the initial schema, Auth schema, Storage schema,
and post-setup search-path statements, then stopped while defining an event-trigger
function. The event-trigger workaround below removes that blocker.

To inspect that isolated trial:

```sh
docker logs supabase-role-settings-trial
```

The trial uses the separate volume `supabase_doltgres-role-settings-trial1`.
Previous trial volumes are preserved. A retry after changing bootstrap SQL needs
a fresh volume because partially initialized databases are not resumed.

## Event trigger workaround and REST schema refresh

The adapter removes the pinned bootstrap's event-trigger functions and their
trigger definitions, comments, and ownership statements. It preserves unrelated
SQL in the same files, including dashboard roles and grants, the GraphQL schema
and placeholder RPC, and conditional extension permission corrections. The image
build fails if event-trigger setup or references to the removed functions remain.
The standard Postgres bootstrap is unchanged.

Studio hides the Event trigger tab and automatic RLS setup notice, blocks the
direct Event page, and rejects event-trigger create/delete mutations. Its event
trigger query returns an empty list without querying the database. SQL Editor
warnings about creating tables without RLS remain active, and Table Editor still
explicitly enables RLS when selected. SQL migrations and external clients must
enable RLS explicitly. Ordinary table triggers and existing RLS policies are
independent of event triggers; their Doltgres compatibility is not established by
this workaround.

Automatic permission and wrapper setup when installing or removing `pg_cron`,
`pg_net`, or `pg_graphql` is unavailable. Supporting these extensions later will
require explicit setup SQL or restoring the event triggers.

PostgREST normally refreshes its schema cache through event-trigger notifications.
Doltgres 1.3.3 also rejects `LISTEN` and `NOTIFY`, so the override sets
`PGRST_DB_CHANNEL_ENABLED=false`. After committing schema changes such as creating
tables, modifying columns or foreign keys, or changing RPC signatures, reload the
REST schema cache with:

```sh
docker kill --signal SIGUSR1 supabase-rest
```

This sends a reload signal; it does not terminate PostgREST. Alternatively, restart
the `rest` service. Studio's metadata refresh does not refresh PostgREST's cache.
The full REST service has not yet been validated against Doltgres because database
bootstrap still fails; the reload command follows PostgREST's documented behavior.

From the repository root, run the removal checks with:

```sh
python3 docker/volumes/doltgres/test_event_triggers.py
```

The fresh event-trigger-free trial passed post-setup and stopped in the mounted
`99-jwt.sql` at `ALTER DATABASE postgres SET "app.settings.jwt_exp"`, with
`ERROR: ALTER DATABASE is not yet supported`. Its container is
`supabase-eventless-trial`, and its separate volume is
`supabase_doltgres-eventless-trial1`:

```sh
docker logs supabase-eventless-trial
```

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
