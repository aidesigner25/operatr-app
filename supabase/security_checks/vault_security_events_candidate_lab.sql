-- CANDIDATE MIGRATION AUDIT LAB: SYNTHETIC LOCAL RESTORE ONLY. Never use a hosted project.
-- This prototype creates temporary tables, triggers and fake records in one
-- transaction and ends in ROLLBACK. It is not a production migration.
begin;
do $$ begin
 if to_regclass('public.operatr_full_recovery_lab_marker') is null then raise exception 'STOP: lab marker missing'; end if;
 if not exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') then raise exception 'STOP: incorrect lab marker'; end if;
 if to_regclass('public.vault_security_events') is not null or to_regprocedure('public.record_credential_security_event()') is not null then raise exception 'STOP: lab objects already exist'; end if;
 if exists(select 1 from auth.users where id='a0000000-0000-4000-8000-000000000004') then raise exception 'STOP: lab user already exists'; end if;
end $$;
-- BEGIN EXACT MIGRATION
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

-- END EXACT MIGRATION

do $$ begin
 if has_function_privilege('anon','public.record_credential_security_event()','EXECUTE') or has_function_privilege('authenticated','public.record_credential_security_event()','EXECUTE') then raise exception 'FAIL: public role can execute trigger function'; end if;
 if has_table_privilege('anon','public.vault_security_events','SELECT') or has_table_privilege('authenticated','public.vault_security_events','INSERT') or has_table_privilege('authenticated','public.vault_security_events','UPDATE') or has_table_privilege('authenticated','public.vault_security_events','DELETE') or has_table_privilege('authenticated','public.vault_security_events','TRUNCATE') then raise exception 'FAIL: audit table privileges'; end if;
 if has_table_privilege('service_role','public.vault_security_events','INSERT') or has_table_privilege('service_role','public.vault_security_events','UPDATE') or has_table_privilege('service_role','public.vault_security_events','DELETE') or not has_table_privilege('service_role','public.vault_security_events','SELECT') then raise exception 'FAIL: maintenance audit privileges'; end if;
 if current_setting('server_version_num')::integer >= 170000 and (has_table_privilege('anon','public.vault_security_events','MAINTAIN') or has_table_privilege('authenticated','public.vault_security_events','MAINTAIN') or has_table_privilege('service_role','public.vault_security_events','MAINTAIN')) then raise exception 'FAIL: audit MAINTAIN privilege'; end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
values('a0000000-0000-4000-8000-000000000004','vault-audit-lab@example.invalid','{"display_name":"Audit Lab"}',now(),now());
set local role authenticated;
do $$
declare a uuid:='a0000000-0000-4000-8000-000000000001'; b uuid:='a0000000-0000-4000-8000-000000000004'; n integer; blocked boolean;
begin
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 update public.google_workspace_connections set encrypted_refresh_token='v1.synthetic-a' where user_id=a;
 get diagnostics n=row_count; if n<>1 then raise exception 'FAIL: first owner update'; end if;
 if (select count(*) from public.vault_security_events where owner_id=a and object_kind='google_connection' and operation='UPDATE')<>1 then raise exception 'FAIL: first owner event'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 if exists(select 1 from public.vault_security_events where owner_id=a) then raise exception 'FAIL: cross-owner audit read'; end if;
 insert into public.vault_credentials(user_id,provider,encrypted_credential,encryption_version,key_id,last_four) values(b,'openai','v1.synthetic-b',1,'lab','test');
 update public.vault_credentials set encrypted_credential='v1.synthetic-b2' where user_id=b and provider='openai';
 delete from public.vault_credentials where user_id=b and provider='openai';
 insert into public.google_workspace_connections(user_id,encrypted_refresh_token) values(b,'v1.synthetic-b');
 update public.google_workspace_connections set encrypted_refresh_token='v1.synthetic-b2' where user_id=b;
 delete from public.google_workspace_connections where user_id=b;
 if (select count(*) from public.vault_security_events where owner_id=b)<>6 then raise exception 'FAIL: six credential mutation events'; end if;
 if (select count(distinct object_kind || ':' || operation) from public.vault_security_events where owner_id=b)<>6 then raise exception 'FAIL: mutation operation coverage'; end if;
 blocked:=false;
 begin insert into public.vault_security_events(owner_id,object_kind,operation) values(b,'vault_credential','INSERT'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: forged event insert'; end if;
 blocked:=false;
 begin update public.vault_security_events set operation='DELETE' where owner_id=b; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: event update'; end if;
 blocked:=false;
 begin delete from public.vault_security_events where owner_id=b; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: event delete'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if exists(select 1 from public.vault_security_events where owner_id=b) then raise exception 'FAIL: reverse cross-owner audit read'; end if;
end $$;
reset role;
-- A maintenance-role write must still generate an event. The metadata does not
-- claim that the owner personally initiated this mutation.
set local role service_role;
insert into public.vault_credentials(user_id,provider,encrypted_credential,encryption_version,key_id,last_four)
values('a0000000-0000-4000-8000-000000000004','google','v1.synthetic-maintenance',1,'lab','test');
reset role;
do $$ begin
 if (select count(*) from public.vault_security_events where owner_id='a0000000-0000-4000-8000-000000000004' and object_kind='vault_credential' and operation='INSERT')<>2 then raise exception 'FAIL: maintenance event'; end if;
end $$;
-- Force event insertion to fail; the same source write must also be rolled back.
alter table public.vault_security_events add constraint operatr_lab_reject_new_events check (false) not valid;
set local role authenticated;
do $$
declare b uuid:='a0000000-0000-4000-8000-000000000004'; rejected boolean:=false;
begin
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 begin
  insert into public.vault_credentials(user_id,provider,encrypted_credential,encryption_version,key_id,last_four) values(b,'anthropic','v1.synthetic-failure',1,'lab','test');
 exception when check_violation then rejected:=true;
 end;
 if not rejected or exists(select 1 from public.vault_credentials where user_id=b and provider='anthropic') then raise exception 'FAIL: audit failure did not reject credential write'; end if;
end $$;
reset role;
-- Remove only the lab-induced failure and exercise the existing guarded
-- maintenance functions on A's synthetic saved credentials.
alter table public.vault_security_events drop constraint operatr_lab_reject_new_events;
set local role service_role;
do $$
declare
 v_user uuid:='a0000000-0000-4000-8000-000000000001';
 v_vault public.vault_credentials%rowtype;
 v_google public.google_workspace_connections%rowtype;
 v_count integer; g_count integer;
begin
 select * into strict v_vault from public.vault_credentials where user_id=v_user and provider='openai';
 select * into strict v_google from public.google_workspace_connections where user_id=v_user;
 select count(*) into v_count from public.vault_security_events where owner_id=v_user and object_kind='vault_credential' and operation='UPDATE';
 select count(*) into g_count from public.vault_security_events where owner_id=v_user and object_kind='google_connection' and operation='UPDATE';
 if not public.operatr_rotate_vault_credential(v_vault.id,v_user,v_vault.provider,v_vault.updated_at,v_vault.encrypted_credential,v_vault.key_id,v_vault.encryption_version,'v1.synthetic-rotated','new',1::smallint) then raise exception 'FAIL: maintenance vault update'; end if;
 if public.operatr_rotate_vault_credential(v_vault.id,v_user,v_vault.provider,v_vault.updated_at,v_vault.encrypted_credential,v_vault.key_id,v_vault.encryption_version,'v1.synthetic-rotated','new',1::smallint) then raise exception 'FAIL: stale maintenance vault update'; end if;
 if not public.operatr_rotate_google_connection(v_user,v_google.updated_at,v_google.encrypted_refresh_token,'v1.synthetic-google-rotated') then raise exception 'FAIL: maintenance Google update'; end if;
 if public.operatr_rotate_google_connection(v_user,v_google.updated_at,v_google.encrypted_refresh_token,'v1.synthetic-google-rotated') then raise exception 'FAIL: stale maintenance Google update'; end if;
 if (select count(*) from public.vault_security_events where owner_id=v_user and object_kind='vault_credential' and operation='UPDATE')<>v_count+1 then raise exception 'FAIL: vault maintenance event count'; end if;
 if (select count(*) from public.vault_security_events where owner_id=v_user and object_kind='google_connection' and operation='UPDATE')<>g_count+1 then raise exception 'FAIL: Google maintenance event count'; end if;
end $$;
reset role;
-- B still has a synthetic credential and several events. Removing the parent
-- must remove both and must not be blocked by its credential-delete trigger.
delete from auth.users where id='a0000000-0000-4000-8000-000000000004';
do $$ begin
 if exists(select 1 from auth.users where id='a0000000-0000-4000-8000-000000000004')
    or exists(select 1 from public.vault_credentials where user_id='a0000000-0000-4000-8000-000000000004')
    or exists(select 1 from public.vault_security_events where owner_id='a0000000-0000-4000-8000-000000000004') then
   raise exception 'FAIL: synthetic account deletion or event cleanup';
 end if;
end $$;
rollback;
select 'PASS: exact audit migration, role isolation, maintenance, deletion cascade, and rollback' as result;
