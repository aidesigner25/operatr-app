-- PROPOSED ONLY: Do not run on the Operatr project until the disposable
-- project test and compatibility checks pass and the change is reviewed.
-- This one DO statement is atomic: any failed verification rolls it back.
-- No tables, rows, policies, functions, service_role grants, or sequences are
-- created or modified. Normal authenticated CRUD is retained except UPDATE
-- and DELETE on vault audit events, where current RLS has no such policies.
-- An inherited PUBLIC/other-role grant can defeat a revoke; the effective-grant
-- assertions detect that and abort rather than silently declaring success.
do $$
declare
  t text;
  privilege_name text;
  allowed boolean;
  table_names text[] := array[
    'profiles','vault_credentials','vault_audit_events','chat_conversations',
    'chat_messages','chat_agent_runs','chat_agent_run_events',
    'google_workspace_connections','chat_value_estimates'
  ];
begin
  foreach t in array table_names loop
    if to_regclass(format('public.%I',t)) is null then
      raise exception 'Missing required table: %', t;
    end if;
    -- Anonymous access is not needed for these nine user-owned tables.
    execute format('revoke all privileges on table public.%I from anon',t);
    -- Preserve authenticated SELECT/INSERT/UPDATE/DELETE for app workflows.
    execute format('revoke truncate, references, trigger on table public.%I from authenticated',t);
    if current_setting('server_version_num')::integer >= 170000 then
      execute format('revoke maintain on table public.%I from authenticated',t);
    end if;
  end loop;
  -- Existing policies allow only owner-scoped audit SELECT and INSERT.
  revoke update, delete on table public.vault_audit_events from authenticated;

  foreach t in array table_names loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon',format('public.%I',t),privilege_name) then
        raise exception 'Anonymous role still inherits % on %; inspect role membership/PUBLIC grants',privilege_name,t;
      end if;
    end loop;
    foreach privilege_name in array array['TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated',format('public.%I',t),privilege_name) then
        raise exception 'Authenticated role still inherits % on %; inspect role membership/PUBLIC grants',privilege_name,t;
      end if;
    end loop;
    if current_setting('server_version_num')::integer >= 170000 then
      execute 'select has_table_privilege($1,$2,$3)' into allowed using 'anon',format('public.%I',t),'MAINTAIN';
      if allowed then raise exception 'Anonymous role still inherits MAINTAIN on %',t; end if;
      execute 'select has_table_privilege($1,$2,$3)' into allowed using 'authenticated',format('public.%I',t),'MAINTAIN';
      if allowed then raise exception 'Authenticated role still inherits MAINTAIN on %',t; end if;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.vault_audit_events','UPDATE') or has_table_privilege('authenticated','public.vault_audit_events','DELETE') then
    raise exception 'Authenticated role still inherits audit UPDATE or DELETE';
  end if;
end $$;
