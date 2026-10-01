# Local Doltgres trial

This override runs the existing Supabase services against Doltgres with debug
logging, with Realtime, logical replication, SQL cryptography, query statistics,
database webhooks, and event triggers disabled. Database bootstrap and its health
check pass with the local `main` image; the complete service stack has not yet
been validated against Doltgres. Bootstrap stops at the first SQL error.

The adapter image copies SQL from `supabase/postgres:17.6.1.136` and runs it against
the local `dolthub/doltgresql:main` image. It keeps the existing service roles,
`db:5432`, and the `postgres` and `_supabase` database names. No PostgreSQL server
runs in the adapter.

## Build and start

Build or load `dolthub/doltgresql:main` into local Docker before building the
adapter. The workarounds below were established against release 1.3.3 and remain
in place while testing the local image's panic fix.

The REST service uses the local `postgrest:doltgres` image, built from the patched
PostgREST checkout. With Nix installed, build and load it from that checkout:

```sh
nix-build -A docker
result/bin/postgrest-docker-load
docker tag postgrest:latest postgrest:doltgres
```

The tested checkout is version 17 development; the standard Supabase stack uses
PostgREST 14.17. The Docker image contains the current checkout, including its
version changes. This override uses `pull_policy: never` for the local REST image.

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
The full REST service has not yet been validated against Doltgres; the reload
command follows PostgREST's documented behavior.

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

## Database JWT settings workaround

The Doltgres override mounts `disabled-jwt-settings.sql` in place of `99-jwt.sql`.
This skips the unsupported `ALTER DATABASE postgres SET "app.settings.jwt_exp"`
statement. The unused `JWT_EXP` variable is removed from the database container.
The standard Postgres stack still runs its original JWT settings script.

Auth continues to receive `GOTRUE_JWT_EXP` from `JWT_EXPIRY`. Direct SQL connections
have no database-level `app.settings.jwt_exp` default; custom SQL that reads it
must supply the value separately. PostgREST's `PGRST_APP_SETTINGS_JWT_EXP`
configuration is retained, but its transaction-local custom settings still need
Doltgres compatibility work: `set_config('app.settings.jwt_exp', '3600', true)`
fails on 1.3.3. The session-level form with `false` works only for that connection
and does not replace a persisted database default.

The fresh JWT-settings trial passed all init scripts and reached the migrations.
It stopped at `DROP EXTENSION IF EXISTS pg_graphql` in
`20220404205710_pg_graphql-on-by-default.sql:42` with
`ERROR: DROP EXTENSION is not yet implemented`. Its separate volume is
`supabase_doltgres-jwt-settings-trial1`. Inspect the preserved container with:

```sh
docker logs supabase-jwt-settings-trial
```

## Absent GraphQL extension drop workaround

The adapter removes only `DROP EXTENSION IF EXISTS pg_graphql` from the four
pinned migrations that use it. Doltgres 1.3.3 does not provide `pg_graphql`, so
these statements have no extension to remove on a fresh volume. The GraphQL
placeholder, grants, and conditional installation blocks are preserved. Other
extension drops are not rewritten. Revisit this workaround if the adapter later
supports `pg_graphql`.

The image built successfully, and comparison of its migration SQL confirmed that
only those four drop statements changed. The fresh trial passed the earlier drop
failure and stopped at
`20241215003910_backfill_pgmq_metadata.sql:42` with
`ERROR: at or near "EOF": syntax error`. Its separate volume is
`supabase_doltgres-graphql-drop-trial1`. Inspect the preserved container with:

```sh
docker logs supabase-graphql-drop-trial
```

## Procedural query comment workaround

Doltgres 1.3.3 misparses line comments in subqueries inside `DO` blocks
([#3488](https://github.com/dolthub/doltgresql/issues/3488)). The adapter converts
three comments in `20241215003910_backfill_pgmq_metadata.sql` to block comments,
preserving the conditions and statements in both procedural blocks. Other
migrations and the standard Postgres bootstrap are unchanged.

The rebuilt image passed both blocks on a fresh volume, then stopped in
`20250205144616_move_orioledb_to_extensions_schema.sql:23` with
`ERROR: receiveMessage recovered panic: interface conversion: interface {} is nil, not bool`.
That release-image trial could not complete initialization. It uses the separate volume
`supabase_doltgres-do-comment-trial1`; inspect its preserved container with:

```sh
docker logs supabase-do-comment-trial
```

## Local main image result

The adapter now uses the local `dolthub/doltgresql:main` image to test the NULL
condition panic fix ([#3489](https://github.com/dolthub/doltgresql/issues/3489)).
The tested base image ID is
`sha256:5b559cf656ed0476f635d311f590461fbf6bba436b3f7f6415bbe9c39c5ab46d`;
its binary still reports version 1.3.3, so the version string alone does not
identify the fix.

On a fresh volume, all init scripts and migrations completed, including the
previously failing orioledb migration. Both bootstrap markers exist, an
authenticated `SELECT 1` succeeds, and Docker reports the database as healthy.
Other services were not started in this isolated trial.

The trial uses `supabase_doltgres-main-panic-fix-trial1`. Inspect it with:

```sh
docker logs supabase-main-panic-fix-trial
```

## PostgREST trial result

PostgREST `v14.17` was started against the healthy local-main database trial,
with the existing Doltgres settings and `PGRST_DB_CHANNEL_ENABLED=false`.
It connects as `authenticator`, but cannot load its schema cache:

```text
function: 'pg_is_other_temp_schema' not found
```

Startup also reports `unable to resolve type regrole` while querying database
configuration, and `function filters are not yet supported` while querying role
settings. The API returns HTTP 503 with `PGRST002` (schema cache unavailable), so
REST CRUD and RPC have not been validated.

The preserved container is `supabase-postgrest-trial`. It points directly to
`supabase-main-panic-fix-trial` on the Compose network and publishes the API only
on `127.0.0.1:13000`, without starting other services:

```sh
docker logs supabase-postgrest-trial
curl -i http://127.0.0.1:13000/
```

## PostgREST catalog workarounds

The Doltgres override sets `PGRST_DB_CONFIG=false`. PostgREST uses its environment
configuration and skips database configuration and role-settings discovery,
bypassing the missing `regrole` type and unsupported aggregate `FILTER` syntax.
Settings stored through `ALTER ROLE` or a database pre-config function are not
loaded. PostgREST still switches to the request's role, but does not automatically
apply that role's catalog settings, including statement timeouts and transaction
isolation defaults. Doltgres YAML settings for new physical connections do not
replace settings for roles selected later within those connections.

The adapter installs `postgrest-compat.sql` after the init scripts and before the
upstream migrations. Its `pg_catalog.pg_is_other_temp_schema(oid)` function
returns false, allowing schema discovery without this missing built-in. This
deployment must avoid temporary-table workloads because the helper cannot exclude
other sessions' temporary schemas. Remove the helper when native support becomes
available; its creation intentionally fails if a function with the same signature
already exists. The standard Postgres stack is unchanged.

For an already initialized trial database, apply the helper once:

```sh
docker cp volumes/doltgres/postgrest-compat.sql supabase-main-panic-fix-trial:/tmp/postgrest-compat.sql
docker exec supabase-main-panic-fix-trial psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/postgrest-compat.sql
```

These commands assume the working directory is `docker/`. Recreate PostgREST to
pick up the environment change. The preserved `supabase-postgrest-trial` has both
workarounds applied. It gets past the three earlier errors but stops loading its
schema cache at `function: '_pg_char_max_length' not found`, referring to
`information_schema._pg_char_max_length`. Requests still return HTTP 503 with
`PGRST002`, so CRUD and RPC remain unvalidated.

The compatibility SQL also defines
`information_schema._pg_char_max_length(oid, integer)` with PostgreSQL's length
rules for `char`, `varchar`, `bit`, and `varbit`, returning NULL for unlimited
lengths and unrelated types. This helper is IMMUTABLE and STRICT. Checks as
`authenticator` passed for all four types, unlimited lengths, unrelated types,
and NULL input.

After applying this helper and restarting PostgREST, schema discovery passes the
earlier character-length failure and stops at
`function: '_pg_truetypid' not found` (`information_schema._pg_truetypid`).
The API still returns HTTP 503 while the schema cache is unavailable.

An SQL-only `_pg_truetypid` replacement was tested and rolled back. The PL/pgSQL
function can be created, but PostgREST's `_pg_truetypid(a.*, t.*)` call fails while
resolving its composite-row arguments, with `could not be found in any table in
scope`. This reproduces on stock 1.3.3 and the tested local main image. A SQL-language
definition using named composite fields also fails during creation with
`table not found: t`. No `_pg_truetypid` helper is installed by this adapter.

The patched PostgREST checkout changes its column discovery query to inline
`CASE WHEN t.typtype = 'd' THEN t.typbasetype ELSE a.atttypid END` in place of the
helper call. The neighboring `_pg_truetypmod` call also takes composite rows and
is replaced with its equivalent expression,
`CASE WHEN t.typtype = 'd' THEN t.typtypmod ELSE a.atttypmod END`.

The patched checkout built successfully through Nix in a Docker builder container
and was loaded as `postgrest:doltgres`. The inline expressions were compared
against PostgreSQL's original helpers for bounded varchar, text, bit, and a domain
over varchar; type IDs and modifiers matched for all four columns.

The running `supabase-postgrest-trial` now uses this image and passes the composite
helper blocker. Schema loading next fails with
`function: 'pg_relation_is_updatable' not found`. Requests still return HTTP 503
with `PGRST002`; no CRUD or RPC success has been established.

The PostgREST fork also removes `pg_relation_is_updatable` calls from table
discovery. Only ordinary and partitioned tables are marked insertable, updatable,
and deletable; views and foreign tables are marked non-writable. This skips
discovery of automatically updatable views and trigger-based view writes. The
flags control advertised methods in OPTIONS and OpenAPI; this workaround does not
enforce read-only access or replace database privileges. Ordinary table writes
retain their existing metadata flags, but actual CRUD compatibility still needs
runtime validation.

The rebuilt `postgrest:doltgres` image passes the missing relation-capability
function and next fails schema loading with
`function: 'json_array_elements' not found`. The trial remains running at
`127.0.0.1:13000`; it still returns HTTP 503 with `PGRST002`.

The PostgREST fork bypasses view key-dependency discovery because neither
`json_array_elements` nor `jsonb_array_elements` is available. It supplies an
empty view-dependency list while retaining ordinary table relationship discovery.
Views no longer inherit primary-key metadata or foreign-key relationships from
their source tables, so inferred resource embedding involving views is unavailable.
This change does not remove views from table discovery or disable their direct
read endpoints; actual view reads still require Doltgres compatibility testing.

The rebuilt image passes the JSON helper blocker and ordinary table relationship
discovery, then fails the RPC function discovery query with
`at or near "any": syntax error`. PostgREST exits with status 1, so the trial API
port is no longer listening. The failing schema query was captured separately for
investigation; CRUD and RPC remain unvalidated.

The PostgREST fork rewrites the RPC discovery predicate `setting ~ ANY($2)` as
a correlated `EXISTS` over `unnest($2::text[])`, avoiding the syntax failure in
[dolthub/doltgresql#3499](https://github.com/dolthub/doltgresql/issues/3499).
The recursive type-resolution CTE and comments remain; removing either did not
resolve that error. The fixed-delimiter isolation-setting expression uses
`split_part` instead of the unavailable `regexp_split_to_array`, preserving NULL
when the setting lacks an equals sign.

The rewritten SQL succeeds on PostgreSQL 15.19 and on the standalone local-main
Doltgres image with the same test schemas and functions. PostgreSQL returns two
RPC metadata rows; Doltgres returns zero despite both test functions existing and
being callable. Passing this query therefore does not establish correct RPC
discovery. SQL `PREPARE` is also unsupported in Doltgres; the standalone follow-up
query uses the original parameter values as typed array literals. PostgREST uses
the PostgreSQL wire protocol to bind its parameters.

The rebuilt `postgrest:doltgres` trial passes the regex-ANY syntax blocker and now
stops schema loading at `function: 'parse_ident' not found`. Unlike the earlier
syntax failure, the process stays running and retries; API requests return HTTP
503 with `PGRST002`. RPC discovery correctness remains unresolved even though
the syntax failure has been bypassed.

## Previous startup result (1.0.0)

The earlier trial with Doltgres 1.0.0 started with debug logging, then stopped in
`00000000000000-initial-schema.sql` at:

```sql
create publication supabase_realtime;
```

Doltgres reported `syntax error: unimplemented: this syntax`. The database stayed
unhealthy. The adapter now uses the local `main` image and removes this statement
during the image build. The released image also lacks predefined roles required by the copied SQL;
the adapter creates compatibility roles before those grants run. The bootstrap
runner still stops at any remaining SQL error.
