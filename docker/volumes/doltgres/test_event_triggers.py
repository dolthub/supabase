"""Verify event-trigger removal preserves unrelated pinned-bootstrap SQL."""

from pathlib import Path
import subprocess
import unittest


class EventTriggerRemovalTest(unittest.TestCase):
    def rewrite(self, sql):
        script = Path(__file__).with_name("remove-event-triggers.sed")
        return subprocess.check_output(
            ["sed", "-E", "-f", str(script)], input=sql, text=True
        )

    def test_graphql_nested_dollar_quotes_and_placeholder(self):
        placeholder = "CREATE FUNCTION graphql_public.graphql() RETURNS jsonb AS $$ SELECT '{}'::jsonb; $$ LANGUAGE sql;\n"
        sql = (
            "create or replace function extensions.grant_pg_graphql_access()\n"
            "returns event_trigger language plpgsql AS $func$\n"
            "BEGIN\n" + placeholder + "END;\n$func$;\n" + placeholder
        )
        self.assertEqual(self.rewrite(sql), placeholder)

    def test_postgrest_function_terminator_and_following_sql(self):
        sql = (
            "CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger AS $$\n"
            "BEGIN\n  NOTIFY pgrst, 'reload schema';\nEND; $$ LANGUAGE plpgsql;\n"
            "GRANT USAGE ON SCHEMA public TO postgres;\n"
        )
        self.assertEqual(self.rewrite(sql), "GRANT USAGE ON SCHEMA public TO postgres;\n")

    def test_trigger_definition_and_metadata(self):
        sql = (
            "DROP EVENT TRIGGER IF EXISTS issue_pg_cron_access;\n"
            "ALTER FUNCTION extensions.grant_pg_cron_access OWNER TO supabase_admin;\n"
            "CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end\n"
            "WHEN TAG IN ('CREATE EXTENSION')\n"
            "EXECUTE FUNCTION extensions.grant_pg_cron_access();\n"
            "COMMENT ON FUNCTION extensions.grant_pg_cron_access IS 'Grants access';\n"
            "CREATE ROLE dashboard_user;\n"
        )
        self.assertEqual(self.rewrite(sql), "CREATE ROLE dashboard_user;\n")

    def test_data_trigger_and_regular_function_are_preserved(self):
        sql = (
            "CREATE FUNCTION public.audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;\n"
            "CREATE TRIGGER audit AFTER INSERT ON public.items EXECUTE FUNCTION public.audit();\n"
        )
        self.assertEqual(self.rewrite(sql), sql)

    def test_single_line_event_trigger_preserves_following_statement(self):
        sql = (
            "CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end EXECUTE FUNCTION extensions.pgrst_ddl_watch();\n"
            "CREATE ROLE dashboard_user;\n"
        )
        self.assertEqual(self.rewrite(sql), "CREATE ROLE dashboard_user;\n")

    def test_trigger_name_on_its_own_line(self):
        sql = (
            "CREATE EVENT TRIGGER pgrst_ddl_watch\n"
            "ON ddl_command_end\n"
            "EXECUTE PROCEDURE extensions.pgrst_ddl_watch();\n"
            "GRANT USAGE ON SCHEMA public TO postgres;\n"
        )
        self.assertEqual(self.rewrite(sql), "GRANT USAGE ON SCHEMA public TO postgres;\n")

    def test_unknown_event_function_remains_for_build_validation(self):
        sql = "CREATE FUNCTION public.custom_event() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN END; $$;\n"
        self.assertEqual(self.rewrite(sql), sql)
        trigger = "CREATE EVENT TRIGGER custom_event ON ddl_command_end EXECUTE FUNCTION custom_event();\n"
        self.assertEqual(self.rewrite(trigger), trigger)


if __name__ == "__main__":
    unittest.main()
