-- SYNTHETIC LOCAL RESTORE LAB ONLY. Do not run on any hosted project.
-- This prototype creates temporary tables, triggers and fake records in one
-- transaction and ends in ROLLBACK. It is not a production migration.
begin;
do $$ begin
 if to_regclass('public.operatr_full_recovery_lab_marker') is null then raise exception 'STOP: lab marker missing'; end if;
 if not exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') then raise exception 'STOP: incorrect lab marker'; end if;
 if to_regclass('public.operatr_lab_security_events') is not null or to_regprocedure('public.operatr_lab_record_credential_change()') is not null then raise exception 'STOP: lab objects already exist'; end if;
 if exists(select 1 from auth.users where id='a0000000-0000-4000-8000-000000000004') then raise exception 'STOP: lab user already exists'; end if;
end $$;
create table public.operatr_lab_security_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,
 object_kind text not null check (object_kind in ('vault_credential','google_connection')),
 operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
 created_at timestamptz not null default now()
);
alter table public.operatr_lab_security_events enable row level security;
revoke all on public.operatr_lab_security_events from public, anon, authenticated;
grant select on public.operatr_lab_security_events to authenticated;
create policy "lab owners read their own security events" on public.operatr_lab_security_events
 for select to authenticated using ((select auth.uid())=owner_id);

-- SECURITY DEFINER is essential here because ordinary users cannot insert the
-- event directly. An empty search_path and qualified names limit name lookup.
create function public.operatr_lab_record_credential_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_kind text;
begin
 if tg_op='DELETE' then v_owner:=old.user_id; else v_owner:=new.user_id; end if;
 if tg_table_schema<>'public' or tg_table_name not in ('vault_credentials','google_workspace_connections') then raise exception 'unexpected audit source'; end if;
 v_kind:=case when tg_table_name='vault_credentials' then 'vault_credential' else 'google_connection' end;
 insert into public.operatr_lab_security_events(owner_id,object_kind,operation) values(v_owner,v_kind,tg_op);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.operatr_lab_record_credential_change() from public, anon, authenticated;
create trigger operatr_lab_vault_audit after insert or update or delete on public.vault_credentials
 for each row execute function public.operatr_lab_record_credential_change();
create trigger operatr_lab_google_audit after insert or update or delete on public.google_workspace_connections
 for each row execute function public.operatr_lab_record_credential_change();

do $$ begin
 if has_function_privilege('anon','public.operatr_lab_record_credential_change()','EXECUTE') or has_function_privilege('authenticated','public.operatr_lab_record_credential_change()','EXECUTE') then raise exception 'FAIL: public role can execute trigger function'; end if;
 if has_table_privilege('anon','public.operatr_lab_security_events','SELECT') or has_table_privilege('authenticated','public.operatr_lab_security_events','INSERT') or has_table_privilege('authenticated','public.operatr_lab_security_events','UPDATE') or has_table_privilege('authenticated','public.operatr_lab_security_events','DELETE') or has_table_privilege('authenticated','public.operatr_lab_security_events','TRUNCATE') then raise exception 'FAIL: audit table privileges'; end if;
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
 if (select count(*) from public.operatr_lab_security_events where owner_id=a and object_kind='google_connection' and operation='UPDATE')<>1 then raise exception 'FAIL: first owner event'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 if exists(select 1 from public.operatr_lab_security_events where owner_id=a) then raise exception 'FAIL: cross-owner audit read'; end if;
 insert into public.vault_credentials(user_id,provider,encrypted_credential,encryption_version,key_id,last_four) values(b,'openai','v1.synthetic-b',1,'lab','test');
 update public.vault_credentials set encrypted_credential='v1.synthetic-b2' where user_id=b and provider='openai';
 delete from public.vault_credentials where user_id=b and provider='openai';
 insert into public.google_workspace_connections(user_id,encrypted_refresh_token) values(b,'v1.synthetic-b');
 update public.google_workspace_connections set encrypted_refresh_token='v1.synthetic-b2' where user_id=b;
 delete from public.google_workspace_connections where user_id=b;
 if (select count(*) from public.operatr_lab_security_events where owner_id=b)<>6 then raise exception 'FAIL: six credential mutation events'; end if;
 if (select count(distinct object_kind || ':' || operation) from public.operatr_lab_security_events where owner_id=b)<>6 then raise exception 'FAIL: mutation operation coverage'; end if;
 blocked:=false;
 begin insert into public.operatr_lab_security_events(owner_id,object_kind,operation) values(b,'vault_credential','INSERT'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: forged event insert'; end if;
 blocked:=false;
 begin update public.operatr_lab_security_events set operation='DELETE' where owner_id=b; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: event update'; end if;
 blocked:=false;
 begin delete from public.operatr_lab_security_events where owner_id=b; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FAIL: event delete'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if exists(select 1 from public.operatr_lab_security_events where owner_id=b) then raise exception 'FAIL: reverse cross-owner audit read'; end if;
end $$;
reset role;
-- A maintenance-role write must still generate an event. The metadata does not
-- claim that the owner personally initiated this mutation.
set local role service_role;
insert into public.vault_credentials(user_id,provider,encrypted_credential,encryption_version,key_id,last_four)
values('a0000000-0000-4000-8000-000000000004','google','v1.synthetic-maintenance',1,'lab','test');
reset role;
do $$ begin
 if (select count(*) from public.operatr_lab_security_events where owner_id='a0000000-0000-4000-8000-000000000004' and object_kind='vault_credential' and operation='INSERT')<>2 then raise exception 'FAIL: maintenance event'; end if;
end $$;
-- Force event insertion to fail; the same source write must also be rolled back.
alter table public.operatr_lab_security_events add constraint operatr_lab_reject_new_events check (false) not valid;
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
rollback;
select 'PASS: synthetic credential audit events, isolation, forgery denial, and atomic failure; changes rolled back' as result;
