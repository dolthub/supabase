# These pinned-bootstrap defaults are represented in config.yaml.
# PostgreSQL-only preload libraries (safeupdate, supautils) are omitted.
# Leave unknown settings intact so the Docker build rejects them.
/^[[:space:]]*ALTER[[:space:]]+(USER|ROLE)[[:space:]]+(postgres|supabase_admin|supabase_auth_admin|supabase_storage_admin)[[:space:]]+SET[[:space:]]+search_path[[:space:]]+(TO|=)[[:space:]]+[^;]+;/Id
/^[[:space:]]*ALTER[[:space:]]+ROLE[[:space:]]+(anon|authenticated|authenticator)[[:space:]]+SET[[:space:]]+statement_timeout[[:space:]]*(TO|=)[[:space:]]*'(3s|8s)';[[:space:]]*$/Id
/^[[:space:]]*ALTER[[:space:]]+ROLE[[:space:]]+authenticator[[:space:]]+SET[[:space:]]+lock_timeout[[:space:]]+TO[[:space:]]+'8s';[[:space:]]*$/Id
/^[[:space:]]*ALTER[[:space:]]+ROLE[[:space:]]+supabase_auth_admin[[:space:]]+SET[[:space:]]+idle_in_transaction_session_timeout[[:space:]]+TO[[:space:]]+60000;[[:space:]]*$/Id
/^[[:space:]]*ALTER[[:space:]]+ROLE[[:space:]]+(supabase_admin|supabase_auth_admin|supabase_storage_admin)[[:space:]]+SET[[:space:]]+log_statement[[:space:]]*=[[:space:]]*none;[[:space:]]*$/Id
/^[[:space:]]*ALTER[[:space:]]+ROLE[[:space:]]+supabase_read_only_user[[:space:]]+SET[[:space:]]+default_transaction_read_only[[:space:]]*=[[:space:]]*on;[[:space:]]*$/Id
/^[[:space:]]*ALTER[[:space:]]+ROLE[[:space:]]+authenticator[[:space:]]+SET[[:space:]]+session_preload_libraries[[:space:]]*=[[:space:]]*('safeupdate'|supautils,[[:space:]]*safeupdate);[[:space:]]*$/Id
