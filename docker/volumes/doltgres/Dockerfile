# Reuse the exact database bootstrap supplied by the base Compose stack.
# Only SQL is copied; PostgreSQL binaries and extension libraries stay behind.
FROM supabase/postgres:17.6.1.136 AS bootstrap

FROM dolthub/doltgresql:1.3.3

COPY --from=bootstrap /docker-entrypoint-initdb.d/ /opt/supabase/bootstrap/
RUN sed -i '/^create publication supabase_realtime;$/d' /opt/supabase/bootstrap/init-scripts/00000000000000-initial-schema.sql
COPY --chmod=755 bootstrap.sh /docker-entrypoint-initdb.d/00-supabase.sh
