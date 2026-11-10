-- READ ONLY metadata inventory. Run in the existing Operatr project's SQL Editor.
-- This reads no user rows, credentials, ciphertext, account IDs, or policy text.
-- A true grant is not itself proof of exposure: RLS is a separate layer, and
-- TRUNCATE is not ordinarily offered by the Supabase REST Data API. Review the
-- actual paths before changing grants. Missing tables must be investigated.
with wanted(table_name) as (values
  ('profiles'), ('vault_credentials'), ('vault_audit_events'),
  ('chat_conversations'), ('chat_messages'), ('chat_agent_runs'),
  ('chat_agent_run_events'), ('google_workspace_connections'), ('chat_value_estimates')
), actual as (
  select w.table_name, c.oid as table_oid, c.relrowsecurity as rls_enabled
  from wanted w left join pg_catalog.pg_class c
    on c.relname = w.table_name and c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
)
select a.table_name,
  a.table_oid is not null as table_exists,
  a.rls_enabled,
  case when a.table_oid is null then null else (select count(*) from pg_catalog.pg_policies p where p.schemaname='public' and p.tablename=a.table_name) end as policy_count,
  case when a.table_oid is null then null else has_table_privilege('anon',a.table_oid,'SELECT') end as anon_select_grant,
  case when a.table_oid is null then null else has_table_privilege('anon',a.table_oid,'INSERT') end as anon_insert_grant,
  case when a.table_oid is null then null else has_table_privilege('authenticated',a.table_oid,'SELECT') end as authenticated_select_grant,
  case when a.table_oid is null then null else has_table_privilege('authenticated',a.table_oid,'INSERT') end as authenticated_insert_grant,
  case when a.table_oid is null then null else has_table_privilege('authenticated',a.table_oid,'UPDATE') end as authenticated_update_grant,
  case when a.table_oid is null then null else has_table_privilege('authenticated',a.table_oid,'DELETE') end as authenticated_delete_grant,
  case when a.table_oid is null then null else has_table_privilege('authenticated',a.table_oid,'TRUNCATE') end as authenticated_truncate_grant
from actual a order by a.table_name;
