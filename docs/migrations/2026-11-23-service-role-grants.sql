-- Sled Finder · let the Edge Functions (service_role) read and write app tables
-- Incremental migration for project cpmieqcsbvozwrbjagqm. Run in the Supabase SQL editor
-- (do not run from an agent machine). Safe to re-run.
--
-- Why: this project was created without Supabase's old automatic Data API grants, so
-- service_role only has TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on public tables. Every Edge
-- Function (create-checkout, create-portal-session, stripe-webhook, delete-account,
-- dispatch-push) uses the service_role key and failed with
--   "permission denied for table profiles"  (PostgREST 403 → function 500).
-- service_role bypasses RLS and is only ever used on the server; nothing here changes what
-- anon or authenticated (the app) can do.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables, sequences and functions created later by the postgres role get the same grants.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
