# Remove only the known event-trigger functions in the pinned bootstrap.
# GraphQL helpers use $func$ around bodies containing nested $$ functions.
/^[[:space:]]*CREATE[[:space:]]+OR[[:space:]]+REPLACE[[:space:]]+FUNCTION[[:space:]]+extensions\.(grant_pg_cron_access|grant_pg_net_access|pgrst_ddl_watch|pgrst_drop_watch)\(/I,/^[[:space:]]*(END;[[:space:]]*)?\$\$.*;[[:space:]]*$/d
/^[[:space:]]*CREATE[[:space:]]+OR[[:space:]]+REPLACE[[:space:]]+FUNCTION[[:space:]]+extensions\.(grant_pg_graphql_access|set_graphql_placeholder)\(/I,/^[[:space:]]*\$func\$;[[:space:]]*$/d
# Trigger definitions may span several lines. Handle one-line definitions too.
/^[[:space:]]*CREATE[[:space:]]+EVENT[[:space:]]+TRIGGER[[:space:]]+(pgrst_ddl_watch|pgrst_drop_watch|issue_pg_cron_access|issue_pg_net_access|issue_pg_graphql_access|issue_graphql_placeholder)([[:space:]]|$)/I {
  /;/d
  :trigger_statement
  N
  /;/!b trigger_statement
  d
}
/^[[:space:]]*DROP[[:space:]]+EVENT[[:space:]]+TRIGGER[[:space:]]+(IF[[:space:]]+EXISTS[[:space:]]+)?(api_restart|pgrst_ddl_watch|pgrst_drop_watch|issue_pg_cron_access|issue_pg_net_access|issue_pg_graphql_access|issue_graphql_placeholder)[[:space:];]/Id
/^[[:space:]]*(COMMENT[[:space:]]+ON|ALTER)[[:space:]]+FUNCTION[[:space:]]+extensions\.(grant_pg_cron_access|grant_pg_net_access|grant_pg_graphql_access|set_graphql_placeholder|pgrst_ddl_watch|pgrst_drop_watch)[[:space:]]/Id
