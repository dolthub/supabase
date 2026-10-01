"""Check the pinned-bootstrap grant rewrite with GNU sed."""

from pathlib import Path
import subprocess
import unittest


class DefaultPrivilegesRewriteTest(unittest.TestCase):
    def rewrite(self, sql):
        script = Path(__file__).with_name("rewrite-default-privileges.sed")
        return subprocess.check_output(
            ["sed", "-z", "-E", "-f", str(script)], input=sql, text=True
        )

    def test_object_types_and_creator_scopes(self):
        for scope in ("", "FOR USER supabase_admin ", "FOR ROLE supabase_auth_admin "):
            for kind in ("TABLES", "SEQUENCES", "FUNCTIONS", "ROUTINES"):
                with self.subTest(scope=scope, kind=kind):
                    sql = (
                        f"ALTER DEFAULT PRIVILEGES {scope}IN SCHEMA auth\n"
                        f"  GRANT ALL ON {kind} TO postgres, dashboard_user;"
                    )
                    self.assertEqual(
                        self.rewrite(sql),
                        f"GRANT ALL ON ALL {kind} IN SCHEMA auth TO postgres, dashboard_user;",
                    )

    def test_case_multiline_and_grant_option(self):
        sql = (
            "alter default privileges for user supabase_admin in schema extensions "
            "grant all privileges\n on routines to postgres with grant option;"
        )
        self.assertEqual(
            self.rewrite(sql),
            "GRANT ALL ON ALL routines IN SCHEMA extensions TO postgres with grant option;",
        )

    def test_statements_inside_function_body(self):
        sql = (
            "BEGIN\n  ALTER DEFAULT PRIVILEGES IN SCHEMA cron GRANT ALL ON TABLES "
            "TO postgres WITH GRANT OPTION;\nEND;"
        )
        self.assertEqual(
            self.rewrite(sql),
            "BEGIN\n  GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres WITH GRANT OPTION;\nEND;",
        )

    def test_unsupported_forms_remain_for_build_validation(self):
        for sql in (
            "ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO postgres;",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;",
        ):
            with self.subTest(sql=sql):
                self.assertEqual(self.rewrite(sql), sql)

    def test_existing_grants_are_unchanged(self):
        sql = "GRANT SELECT ON public.private_table TO authenticated;"
        self.assertEqual(self.rewrite(sql), sql)


if __name__ == "__main__":
    unittest.main()
