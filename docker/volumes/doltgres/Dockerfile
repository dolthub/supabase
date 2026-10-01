# Reuse the exact database bootstrap supplied by the base Compose stack.
# Only SQL is copied; PostgreSQL binaries and extension libraries stay behind.
FROM supabase/postgres:17.6.1.136 AS bootstrap

FROM dolthub/doltgresql:main

COPY --from=bootstrap /docker-entrypoint-initdb.d/ /opt/supabase/bootstrap/
COPY predefined-roles.sql /opt/supabase/predefined-roles.sql
COPY rewrite-default-privileges.sed /opt/supabase/rewrite-default-privileges.sed
COPY rewrite-role-settings.sed /opt/supabase/rewrite-role-settings.sed
COPY remove-event-triggers.sed /opt/supabase/remove-event-triggers.sed
RUN sed -i '/^create publication supabase_realtime;$/d' /opt/supabase/bootstrap/init-scripts/00000000000000-initial-schema.sql
RUN sed -i \
      -e '/^create extension if not exists pgcrypto /d' \
      -e '/^create extension if not exists "uuid-ossp" /s/schema extensions/schema public/' \
      /opt/supabase/bootstrap/init-scripts/00000000000000-initial-schema.sql \
    && printf '%s\n' '-- Query statistics are disabled for the Doltgres deployment.' \
      > /opt/supabase/bootstrap/migrations/00-extension.sql
RUN find /opt/supabase/bootstrap -type f -name '*.sql' \
      -exec sed -z -E -i -f /opt/supabase/rewrite-default-privileges.sed {} + \
    && find /opt/supabase/bootstrap -type f -name '*.sql' -exec sh -c \
      'for sql_file do \
        if grep -zqiE "alter[[:space:]]+default[[:space:]]+privileges" "$sql_file"; then \
          printf "Unconverted default privileges in %s\n" "$sql_file" >&2; exit 1; \
        fi; \
      done' sh {} +
RUN find /opt/supabase/bootstrap -type f -name '*.sql' \
      -exec sed -E -i -f /opt/supabase/rewrite-role-settings.sed {} + \
    && find /opt/supabase/bootstrap -type f -name '*.sql' -exec sh -c \
      'for sql_file do \
        if grep -zqiE "alter[[:space:]]+(role|user)[[:space:]]+[[:alnum:]_]+[[:space:]]+set[[:space:]]" "$sql_file"; then \
          printf "Unconverted role setting in %s\n" "$sql_file" >&2; exit 1; \
        fi; \
      done' sh {} +
# Post-setup wraps pg_net trigger creation in a DO block. Remove that whole
# section, preserving the dashboard role and grants that follow it.
RUN sed -i '/^-- Trigger for pg_cron/,/^-- Supabase dashboard user/{ /^-- Supabase dashboard user/!d; }' \
      /opt/supabase/bootstrap/init-scripts/00000000000003-post-setup.sql \
    && find /opt/supabase/bootstrap -type f -name '*.sql' \
      -exec sed -E -i -f /opt/supabase/remove-event-triggers.sed {} + \
    && find /opt/supabase/bootstrap -type f -name '*.sql' -exec sh -c \
      'for sql_file do \
        if grep -zqiE "(returns[[:space:]]+event_trigger|(create|drop|alter)[[:space:]]+event[[:space:]]+trigger|pg_event_trigger|extensions[.](grant_pg_cron_access|grant_pg_net_access|grant_pg_graphql_access|set_graphql_placeholder|pgrst_ddl_watch|pgrst_drop_watch))" "$sql_file"; then \
          printf "Unconverted event trigger in %s\n" "$sql_file" >&2; exit 1; \
        fi; \
      done' sh {} +
# pg_graphql is unavailable in 1.3.3, so these absent-extension drops are no-ops.
# Preserve each migration's placeholder, grants, and conditional installation.
RUN sed -E -i '/^[[:space:]]*drop[[:space:]]+extension[[:space:]]+if[[:space:]]+exists[[:space:]]+pg_graphql;[[:space:]]*$/Id' \
      /opt/supabase/bootstrap/migrations/20220404205710_pg_graphql-on-by-default.sql \
      /opt/supabase/bootstrap/migrations/20220613123923_pg_graphql-pg-dump-perms.sql \
      /opt/supabase/bootstrap/migrations/20231017062225_grant_pg_graphql_permissions_for_custom_roles.sql \
      /opt/supabase/bootstrap/migrations/20260421000000_pg_graphql-off-by-default.sql
# Doltgres 1.3.3 misparses line comments in procedural subqueries (#3488).
# Use block comments in the affected expressions without changing their SQL.
RUN sed -i \
      -e 's/-- regular table$/\/\* regular table \*\//' \
      -e 's/-- Make sure only expected columns exist and are correctly named$/\/\* Make sure only expected columns exist and are correctly named \*\//' \
      -e 's/-- include ordinary and unlogged tables$/\/\* include ordinary and unlogged tables \*\//' \
      /opt/supabase/bootstrap/migrations/20241215003910_backfill_pgmq_metadata.sql
COPY --chmod=755 bootstrap.sh /docker-entrypoint-initdb.d/00-supabase.sh
