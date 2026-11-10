-- READ ONLY. Run in the existing Operatr project's SQL Editor.
-- Reports metadata only: no table rows, credentials or ciphertext are read.
-- Missing functions are reported rather than treated as a pass.
with wanted_function(signature) as (values
  ('public.value_estimate_summary()'),
  ('public.value_estimate_summary_local(text)'),
  ('public.operatr_rotation_role_check()'),
  ('public.operatr_rotate_vault_credential(uuid,uuid,text,timestamptz,text,text,smallint,text,text,smallint)'),
  ('public.operatr_rotate_google_connection(uuid,timestamptz,text,text)')
), functions as (
  select signature, to_regprocedure(signature) as oid from wanted_function
), audit_policies as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', policyname, 'command', cmd, 'roles', roles,
    'using', qual, 'with_check', with_check
  ) order by policyname), '[]'::jsonb) as policies
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='vault_audit_events'
)
select 'audit_policies' as check_type, 'public.vault_audit_events' as object,
  policies as details from audit_policies
union all
select 'function', f.signature,
  jsonb_build_object('exists', f.oid is not null,
    'security_definer', p.prosecdef,
    'anon_execute', case when f.oid is null then null else has_function_privilege('anon',f.oid,'EXECUTE') end,
    'authenticated_execute', case when f.oid is null then null else has_function_privilege('authenticated',f.oid,'EXECUTE') end,
    'service_role_execute', case when f.oid is null then null else has_function_privilege('service_role',f.oid,'EXECUTE') end)
from functions f left join pg_catalog.pg_proc p on p.oid=f.oid
union all
select 'audit_sequence', 'public.vault_audit_events.id',
  jsonb_build_object('sequence', pg_get_serial_sequence('public.vault_audit_events','id'),
    'authenticated_usage', case when pg_get_serial_sequence('public.vault_audit_events','id') is null then null else has_sequence_privilege('authenticated',pg_get_serial_sequence('public.vault_audit_events','id'),'USAGE') end,
    'authenticated_select', case when pg_get_serial_sequence('public.vault_audit_events','id') is null then null else has_sequence_privilege('authenticated',pg_get_serial_sequence('public.vault_audit_events','id'),'SELECT') end)
order by 1,2;
