#!/bin/bash
set -euo pipefail

bootstrap_dir=/opt/supabase/bootstrap
bootstrap_started=/var/lib/doltgres/.supabase_bootstrap_started
bootstrap_complete=/var/lib/doltgres/.supabase_bootstrap_complete
bootstrap_step='creating the postgres role'

trap 'printf "Supabase bootstrap failed while %s. See the SQL error above.\n" "$bootstrap_step" >&2' ERR

if [ -f "$bootstrap_complete" ]; then
  exit 0
fi
if [ -f "$bootstrap_started" ]; then
  printf 'An earlier Supabase bootstrap failed. Retry with a fresh Doltgres volume after fixing the SQL error.\n' >&2
  exit 1
fi
touch "$bootstrap_started"

# psql quotes the password as a SQL literal, including embedded quotes.
psql --no-psqlrc --no-password -v ON_ERROR_STOP=1 -U supabase_admin <<'SQL'
\getenv pgpass POSTGRES_PASSWORD
CREATE ROLE postgres SUPERUSER LOGIN PASSWORD :'pgpass';
ALTER DATABASE postgres OWNER TO postgres;
SQL

bootstrap_step='creating compatibility roles'
psql --no-psqlrc --no-password -v ON_ERROR_STOP=1 -U supabase_admin -f /opt/supabase/predefined-roles.sql

# Match the original image's ordering and execution roles. The Compose mounts
# add the existing self-hosted SQL to these directories before initialization.
for bootstrap_file in "$bootstrap_dir"/init-scripts/*.sql; do
  bootstrap_step="running $bootstrap_file as postgres"
  printf '%s\n' "$bootstrap_step"
  psql --no-psqlrc --no-password -v ON_ERROR_STOP=1 -U postgres -f "$bootstrap_file"
done

for bootstrap_file in "$bootstrap_dir"/migrations/*.sql; do
  bootstrap_step="running $bootstrap_file as supabase_admin"
  printf '%s\n' "$bootstrap_step"
  psql --no-psqlrc --no-password -v ON_ERROR_STOP=1 -U supabase_admin -f "$bootstrap_file"
done

touch "$bootstrap_complete"
printf 'Supabase bootstrap completed.\n'
