# GNU sed -z -E: match the schema-scoped GRANT ALL forms in the pinned bootstrap,
# including multiline clauses. Drop creator scope; preserve recipients and grant
# options. The Docker build rejects any default-privilege statements left over.
s/ALTER[[:space:]]+DEFAULT[[:space:]]+PRIVILEGES([[:space:]]+FOR[[:space:]]+(USER|ROLE)[[:space:]]+[[:alnum:]_]+)?[[:space:]]+IN[[:space:]]+SCHEMA[[:space:]]+([[:alnum:]_]+)[[:space:]]+GRANT[[:space:]]+ALL([[:space:]]+PRIVILEGES)?[[:space:]]+ON[[:space:]]+(TABLES|SEQUENCES|FUNCTIONS|ROUTINES)[[:space:]]+TO[[:space:]]+([^;]+);/GRANT ALL ON ALL \5 IN SCHEMA \3 TO \6;/Ig
