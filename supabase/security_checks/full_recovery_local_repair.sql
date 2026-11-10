-- LOCAL SYNTHETIC RESTORE TARGET ONLY. Do not run on hosted projects.
-- Must be executed in one psql session; errors abort the transaction.
begin;
do $$ begin
 if to_regclass('public.operatr_full_recovery_lab_marker') is null then raise exception 'STOP: lab marker missing'; end if;
 if not exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') then raise exception 'STOP: wrong lab marker'; end if;
 if to_regprocedure('public.handle_new_auth_user()') is null then raise exception 'STOP: Auth trigger function missing'; end if;
 if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created' and not tgisinternal) then raise exception 'STOP: existing Auth trigger requires inspection'; end if;
 if exists(select 1 from auth.users where id='a0000000-0000-4000-8000-000000000002') then raise exception 'STOP: synthetic trigger test user already exists'; end if;
end $$;
-- Restore the authenticated grants observed in the application schema.
grant select, insert, update, delete on public.profiles, public.vault_credentials, public.chat_conversations, public.chat_messages, public.chat_agent_runs, public.chat_agent_run_events, public.google_workspace_connections, public.chat_value_estimates to authenticated;
grant select, insert on public.vault_audit_events to authenticated;

-- BEGIN EXACT TABLE GRANT CANDIDATE
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

-- END EXACT TABLE GRANT CANDIDATE

-- Reapply the precise function privilege intent from the relevant migrations.
revoke all on function public.value_estimate_summary() from public, anon;
revoke all on function public.value_estimate_summary_local(text) from public, anon;
grant execute on function public.value_estimate_summary(), public.value_estimate_summary_local(text) to authenticated;
revoke all on function public.operatr_rotation_role_check() from public, anon, authenticated;
revoke all on function public.operatr_rotate_vault_credential(uuid, uuid, text, timestamptz, text, text, smallint, text, text, smallint) from public, anon, authenticated;
revoke all on function public.operatr_rotate_google_connection(uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.operatr_rotation_role_check(), public.operatr_rotate_vault_credential(uuid, uuid, text, timestamptz, text, text, smallint, text, text, smallint), public.operatr_rotate_google_connection(uuid, timestamptz, text, text) to service_role;
revoke all on public.operatr_full_recovery_lab_marker from public, anon, authenticated;
-- Recreate the trigger from 202610280001_phase1_identity_vault.sql.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
-- Actually exercise profile creation, then remove only this synthetic user.
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
values('a0000000-0000-4000-8000-000000000002','trigger-test@example.invalid','{"display_name":"Trigger Test"}',now(),now());
do $$
declare f text; t text; p text;
begin
 if not exists(select 1 from public.profiles where id='a0000000-0000-4000-8000-000000000002' and display_name='Trigger Test') then raise exception 'FAIL: Auth profile trigger'; end if;
 foreach f in array array['public.operatr_rotation_role_check()','public.operatr_rotate_vault_credential(uuid,uuid,text,timestamptz,text,text,smallint,text,text,smallint)','public.operatr_rotate_google_connection(uuid,timestamptz,text,text)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'FAIL: rotation grant %',f; end if;
 end loop;
 foreach f in array array['public.value_estimate_summary()','public.value_estimate_summary_local(text)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or not has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'FAIL: summary grant %',f; end if;
 end loop;
 foreach t in array array['public.profiles','public.vault_credentials','public.chat_conversations','public.chat_messages','public.chat_agent_runs','public.chat_agent_run_events','public.google_workspace_connections','public.chat_value_estimates'] loop
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
   if not has_table_privilege('authenticated',t,p) then raise exception 'FAIL: authenticated % on %',p,t; end if;
  end loop;
 end loop;
 if not has_table_privilege('authenticated','public.vault_audit_events','SELECT') or not has_table_privilege('authenticated','public.vault_audit_events','INSERT') then raise exception 'FAIL: audit read/insert'; end if;
end $$;
delete from auth.users where id='a0000000-0000-4000-8000-000000000002';
commit;
select 'PASS: local trigger and selected permissions repaired; synthetic signup verified' as result;
