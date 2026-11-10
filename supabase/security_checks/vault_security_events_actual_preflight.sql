-- READ ONLY metadata only. Run in the actual Operatr project after the
-- disposable tests pass. A PASS is not permission to apply the candidate.
with objects as (
 select to_regclass('public.vault_credentials') as v,
        to_regclass('public.google_workspace_connections') as g,
        to_regclass('public.vault_security_events') as events,
        to_regprocedure('public.record_credential_security_event()') as function_id,
        to_regclass('auth.users') as users
), checks as (
 select 'required tables exist' as check_name, v is not null and g is not null and users is not null as passed from objects
 union all select 'existing credential RLS enabled', coalesce((select relrowsecurity from pg_class where oid=v),false) and coalesce((select relrowsecurity from pg_class where oid=g),false) from objects
 union all select 'candidate table and function names are unused', events is null and function_id is null from objects
 union all select 'candidate trigger names are unused', not exists(select 1 from pg_trigger t where not t.tgisinternal and ((t.tgrelid=v and t.tgname='vault_security_event') or (t.tgrelid=g and t.tgname='google_connection_security_event'))) from objects
 union all select 'editor can create objects in public', has_schema_privilege(current_user,'public','CREATE') from objects
 union all select 'editor can create source table triggers', coalesce(has_table_privilege(current_user,v,'TRIGGER'),false) and coalesce(has_table_privilege(current_user,g,'TRIGGER'),false) from objects
 union all select 'editor can read and reference Auth users', coalesce(has_table_privilege(current_user,users,'SELECT'),false) and coalesce(has_table_privilege(current_user,users,'REFERENCES'),false) from objects
 union all select 'authenticated can use existing credential tables', not exists(select 1 from (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) as p(priv) where not coalesce(has_table_privilege('authenticated',v,p.priv),false) or not coalesce(has_table_privilege('authenticated',g,p.priv),false)) from objects
)
select check_name,passed from checks order by check_name;
