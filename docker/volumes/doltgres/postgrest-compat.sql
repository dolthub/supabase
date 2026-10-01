-- Temporary workaround for dolthub/doltgresql#3492. This deployment must avoid
-- temporary-table workloads: other sessions' temporary schemas are not excluded.
-- Keep this in pg_catalog because PostgREST clears search_path during discovery.
CREATE FUNCTION pg_catalog.pg_is_other_temp_schema(oid)
RETURNS boolean
LANGUAGE plpgsql
STABLE STRICT
AS $$ BEGIN RETURN false; END; $$;

GRANT EXECUTE ON FUNCTION pg_catalog.pg_is_other_temp_schema(oid) TO authenticator;
