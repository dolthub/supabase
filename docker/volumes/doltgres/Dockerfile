# Reuse the exact database bootstrap supplied by the base Compose stack.
# Only SQL is copied; PostgreSQL binaries and extension libraries stay behind.
FROM supabase/postgres:17.6.1.136 AS bootstrap

FROM dolthub/doltgresql:1.3.3

COPY --from=bootstrap /docker-entrypoint-initdb.d/ /opt/supabase/bootstrap/
COPY predefined-roles.sql /opt/supabase/predefined-roles.sql
COPY rewrite-default-privileges.sed /opt/supabase/rewrite-default-privileges.sed
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
COPY --chmod=755 bootstrap.sh /docker-entrypoint-initdb.d/00-supabase.sh
