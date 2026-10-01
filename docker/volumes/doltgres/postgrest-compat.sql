-- Temporary workaround for dolthub/doltgresql#3492. This deployment must avoid
-- temporary-table workloads: other sessions' temporary schemas are not excluded.
-- Keep this in pg_catalog because PostgREST clears search_path during discovery.
CREATE FUNCTION pg_catalog.pg_is_other_temp_schema(oid)
RETURNS boolean
LANGUAGE plpgsql
STABLE STRICT
AS $$ BEGIN RETURN false; END; $$;

GRANT EXECUTE ON FUNCTION pg_catalog.pg_is_other_temp_schema(oid) TO authenticator;

-- PostgreSQL-compatible column length metadata (dolthub/doltgresql#3495).
CREATE FUNCTION information_schema._pg_char_max_length(typid oid, typmod integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE STRICT
AS $$
BEGIN
  RETURN CASE
    WHEN typmod = -1 THEN NULL
    WHEN typid IN (1042, 1043) THEN typmod - 4
    WHEN typid IN (1560, 1562) THEN typmod
    ELSE NULL
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION information_schema._pg_char_max_length(oid, integer) TO authenticator;
