-- DISPOSABLE ROTATION PROJECT ONLY. Creates persistent test-only RLS policies,
-- grants, audit objects and marker. Never run in the actual Operatr project.
-- The script refuses existing Auth users or lab data; no real data is imported.
begin;
do $$ begin
 if to_regclass('public.operatr_rotation_lab_marker') is null then raise exception 'STOP: disposable rotation marker missing'; end if;
 if not exists(select 1 from public.operatr_rotation_lab_marker where marker='operatr-rotation-lab-only-v1') then raise exception 'STOP: invalid disposable marker'; end if;
 if to_regclass('public.vault_credentials') is null or to_regclass('public.google_workspace_connections') is null then raise exception 'STOP: rotation lab tables missing'; end if;
 if to_regclass('public.profiles') is not null or to_regclass('public.chat_conversations') is not null or to_regclass('public.vault_security_events') is not null or to_regclass('public.operatr_audit_data_api_lab_marker') is not null or to_regprocedure('public.record_credential_security_event()') is not null then raise exception 'STOP: unexpected app or audit objects'; end if;
 if exists(select 1 from auth.users) or exists(select 1 from public.vault_credentials) or exists(select 1 from public.google_workspace_connections) then raise exception 'STOP: disposable project is not empty'; end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename in ('vault_credentials','google_workspace_connections')) then raise exception 'STOP: unexpected existing policies'; end if;
end $$;
-- These policies and grants are for test-only synthetic vault tables.
grant select,insert,update,delete on public.vault_credentials, public.google_workspace_connections to authenticated;
create policy "synthetic vault owner access" on public.vault_credentials for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "synthetic Google owner access" on public.google_workspace_connections for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
-- BEGIN EXACT CANDIDATE
-- CANDIDATE: security events for credential mutations. Test and
-- validate rollout/recovery before applying to any real project. Historic
-- vault_audit_events remain user-influenced and are not converted.
create table public.vault_security_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_kind text not null check (object_kind in ('vault_credential','google_connection')),
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  created_at timestamptz not null default now()
);
create index vault_security_events_owner_created_idx
  on public.vault_security_events(owner_id, created_at desc);
alter table public.vault_security_events enable row level security;
revoke all on public.vault_security_events from public, anon, authenticated, service_role;
grant select on public.vault_security_events to authenticated, service_role;
create policy "owners read their credential security events"
  on public.vault_security_events for select to authenticated
  using ((select auth.uid()) = owner_id);

-- Only the owner of this narrowly scoped SECURITY DEFINER function writes
-- audit rows. Its owning role and table privileges must be verified on the
-- target; no external input or secret values are copied into events.
create function public.record_credential_security_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_kind text;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('vault_credentials','google_workspace_connections') then raise exception 'unexpected audit source'; end if;
 if tg_op='DELETE' then v_owner:=old.user_id; else v_owner:=new.user_id; end if;
 -- Cascading account deletion removes both source records and their events.
 -- Skip creating an event once the deleted Auth parent is no longer visible.
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=v_owner) then return old; end if;
 v_kind:=case when tg_table_name='vault_credentials' then 'vault_credential' else 'google_connection' end;
 insert into public.vault_security_events(owner_id,object_kind,operation) values(v_owner,v_kind,tg_op);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.record_credential_security_event() from public, anon, authenticated, service_role;
create trigger vault_security_event after insert or update or delete on public.vault_credentials
  for each row execute function public.record_credential_security_event();
create trigger google_connection_security_event after insert or update or delete on public.google_workspace_connections
  for each row execute function public.record_credential_security_event();

-- END EXACT CANDIDATE
create table public.operatr_audit_data_api_lab_marker (marker text primary key);
alter table public.operatr_audit_data_api_lab_marker enable row level security;
revoke all on public.operatr_audit_data_api_lab_marker from public, anon, authenticated;
grant select on public.operatr_audit_data_api_lab_marker to service_role;
insert into public.operatr_audit_data_api_lab_marker values('operatr-audit-data-api-lab-v1');
commit;
select 'PASS: disposable audit Data API lab initialized' as result;
