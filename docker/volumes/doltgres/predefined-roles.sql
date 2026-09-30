-- Compatibility roles referenced by the pinned Supabase bootstrap.
-- Ordinary roles permit membership grants but do not implement PostgreSQL's
-- built-in privileges. Preserve native roles if the server already supplies them.
SELECT 'CREATE ROLE pg_read_all_data NOLOGIN NOSUPERUSER NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pg_read_all_data')
\gexec

SELECT 'CREATE ROLE pg_monitor NOLOGIN NOSUPERUSER NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pg_monitor')
\gexec

SELECT 'CREATE ROLE pg_signal_backend NOLOGIN NOSUPERUSER NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pg_signal_backend')
\gexec

SELECT 'CREATE ROLE pg_create_subscription NOLOGIN NOSUPERUSER NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pg_create_subscription')
\gexec
