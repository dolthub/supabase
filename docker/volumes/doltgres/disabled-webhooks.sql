-- Preserve the role expected by 99-roles.sql without initializing HTTP webhooks.
-- Do not create supabase_functions: Studio treats that schema as enabled webhooks.
SELECT 'CREATE ROLE supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION'
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_functions_admin')
\gexec
