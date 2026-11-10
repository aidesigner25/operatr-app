-- ROTATION LAB: run only on a NEW, EMPTY, DISPOSABLE Supabase project.
-- Entire script must be run together. All changes are rolled back.
-- No real users, secrets, provider credentials or existing app data are needed.
-- This lab tests the SQL functions on minimal synthetic tables, not the full
-- app schema, PostgREST, actual encryption, backups, or deployed permissions.
begin;
do $$
begin
  if to_regclass('public.vault_credentials') is not null or to_regclass('public.google_workspace_connections') is not null
     or to_regprocedure('public.operatr_rotation_role_check()') is not null
     or to_regprocedure('public.operatr_rotate_vault_credential(uuid,uuid,text,timestamp with time zone,text,text,smallint,text,text,smallint)') is not null
     or to_regprocedure('public.operatr_rotate_google_connection(uuid,timestamp with time zone,text,text)') is not null then
    raise exception 'STOP: Existing Operatr tables or functions found. Use a separate EMPTY disposable project.';
  end if;
end $$;
create table public.vault_credentials (
 id uuid primary key, user_id uuid not null, provider text not null,
 encrypted_credential text not null, key_id text not null, encryption_version smallint not null, updated_at timestamptz not null
);
create table public.google_workspace_connections (
 user_id uuid primary key, encrypted_refresh_token text not null, updated_at timestamptz not null
);
alter table public.vault_credentials enable row level security;
alter table public.google_workspace_connections enable row level security;
grant usage on schema public to service_role;
grant select, update on public.vault_credentials, public.google_workspace_connections to service_role;
insert into public.vault_credentials values
 ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'openai', 'v1.old.iv.tag.synthetic', 'old', 1, '2026-01-01T00:00:00Z');
insert into public.google_workspace_connections values
 ('22222222-2222-4222-8222-222222222222', 'v1.old.iv.tag.syntheticgoogle', '2026-01-01T00:00:00Z');

-- Phase 6: guarded rotation primitives. No rows are changed by this migration.
-- Only service_role is granted execution. These functions use caller privileges
-- (no SECURITY DEFINER) and atomically compare the original encrypted record.

create or replace function public.operatr_rotation_role_check()
returns boolean language sql stable security invoker set search_path = '' as $$
  select current_user = 'service_role';
$$;

create or replace function public.operatr_rotate_vault_credential(
  p_id uuid,
  p_user_id uuid,
  p_provider text,
  p_updated_at timestamptz,
  p_old_ciphertext text,
  p_old_key_id text,
  p_old_version smallint,
  p_new_ciphertext text,
  p_new_key_id text,
  p_new_version smallint
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if p_old_ciphertext is null or p_new_ciphertext is null or p_old_key_id is null or p_new_key_id is null
     or p_new_version is distinct from 1 or p_new_ciphertext not like 'v1.%'
     or char_length(p_new_key_id) not between 1 and 100 then
    raise exception 'Invalid rotation parameters' using errcode = '22023';
  end if;
  update public.vault_credentials
  set encrypted_credential = p_new_ciphertext, key_id = p_new_key_id, encryption_version = p_new_version
  where id = p_id and user_id = p_user_id and provider = p_provider
    and updated_at = p_updated_at and encrypted_credential = p_old_ciphertext
    and key_id = p_old_key_id and encryption_version = p_old_version;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.operatr_rotate_google_connection(
  p_user_id uuid,
  p_updated_at timestamptz,
  p_old_ciphertext text,
  p_new_ciphertext text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if p_old_ciphertext is null or p_new_ciphertext is null or p_new_ciphertext not like 'v1.%' then
    raise exception 'Invalid rotation parameters' using errcode = '22023';
  end if;
  update public.google_workspace_connections
  set encrypted_refresh_token = p_new_ciphertext
  where user_id = p_user_id and updated_at = p_updated_at and encrypted_refresh_token = p_old_ciphertext;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.operatr_rotation_role_check() from public, anon, authenticated;
revoke all on function public.operatr_rotate_vault_credential(uuid, uuid, text, timestamptz, text, text, smallint, text, text, smallint) from public, anon, authenticated;
revoke all on function public.operatr_rotate_google_connection(uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.operatr_rotation_role_check() to service_role;
grant execute on function public.operatr_rotate_vault_credential(uuid, uuid, text, timestamptz, text, text, smallint, text, text, smallint) to service_role;
grant execute on function public.operatr_rotate_google_connection(uuid, timestamptz, text, text) to service_role;

-- Confirm function grants before switching to service_role. PUBLIC grants must
-- also be absent because anon/authenticated can inherit PUBLIC privileges.
do $$
declare fn regprocedure;
begin
  foreach fn in array array[
    'public.operatr_rotation_role_check()'::regprocedure,
    'public.operatr_rotate_vault_credential(uuid,uuid,text,timestamptz,text,text,smallint,text,text,smallint)'::regprocedure,
    'public.operatr_rotate_google_connection(uuid,timestamptz,text,text)'::regprocedure
  ] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'FAIL: non-maintenance role has execution permission';
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'INCONCLUSIVE: maintenance role lacks execution permission';
    end if;
  end loop;
end $$;
set local role service_role;
do $$
declare
 v_id uuid := '11111111-1111-4111-8111-111111111111';
 u_id uuid := '22222222-2222-4222-8222-222222222222';
 t timestamptz := '2026-01-01T00:00:00Z';
 ok boolean;
begin
 if public.operatr_rotation_role_check() is distinct from true then raise exception 'INCONCLUSIVE: maintenance role not active'; end if;
 -- Stale ciphertext, key metadata, timestamp and ownership must not match.
 if public.operatr_rotate_vault_credential(v_id,u_id,'openai',t,'v1.old.iv.tag.stale','old',1::smallint,'v1.new.iv.tag.synthetic','new',1::smallint) then raise exception 'FAIL: stale vault ciphertext was accepted'; end if;
 if public.operatr_rotate_vault_credential(v_id,u_id,'openai',t,'v1.old.iv.tag.synthetic','wrong',1::smallint,'v1.new.iv.tag.synthetic','new',1::smallint) then raise exception 'FAIL: stale vault metadata was accepted'; end if;
 if public.operatr_rotate_vault_credential(v_id,u_id,'openai',t + interval '1 second','v1.old.iv.tag.synthetic','old',1::smallint,'v1.new.iv.tag.synthetic','new',1::smallint) then raise exception 'FAIL: stale vault timestamp was accepted'; end if;
 if public.operatr_rotate_vault_credential(v_id,'33333333-3333-4333-8333-333333333333','openai',t,'v1.old.iv.tag.synthetic','old',1::smallint,'v1.new.iv.tag.synthetic','new',1::smallint) then raise exception 'FAIL: wrong vault owner was accepted'; end if;
 if public.operatr_rotate_google_connection(u_id,t,'v1.old.iv.tag.stale','v1.new.iv.tag.syntheticgoogle') then raise exception 'FAIL: stale Google ciphertext was accepted'; end if;
 if public.operatr_rotate_google_connection(u_id,t + interval '1 second','v1.old.iv.tag.syntheticgoogle','v1.new.iv.tag.syntheticgoogle') then raise exception 'FAIL: stale Google timestamp was accepted'; end if;
 if not public.operatr_rotate_vault_credential(v_id,u_id,'openai',t,'v1.old.iv.tag.synthetic','old',1::smallint,'v1.new.iv.tag.synthetic','new',1::smallint) then raise exception 'FAIL: matching vault update failed'; end if;
 if not public.operatr_rotate_google_connection(u_id,t,'v1.old.iv.tag.syntheticgoogle','v1.new.iv.tag.syntheticgoogle') then raise exception 'FAIL: matching Google update failed'; end if;
 if public.operatr_rotate_vault_credential(v_id,u_id,'openai',t,'v1.old.iv.tag.synthetic','old',1::smallint,'v1.new.iv.tag.synthetic','new',1::smallint) then raise exception 'FAIL: stale vault retry succeeded'; end if;
 if public.operatr_rotate_google_connection(u_id,t,'v1.old.iv.tag.syntheticgoogle','v1.new.iv.tag.syntheticgoogle') then raise exception 'FAIL: stale Google retry succeeded'; end if;
 if not exists(select 1 from public.vault_credentials where id=v_id and encrypted_credential='v1.new.iv.tag.synthetic' and key_id='new' and encryption_version=1) then raise exception 'FAIL: vault updated incorrectly'; end if;
 if not exists(select 1 from public.google_workspace_connections where user_id=u_id and encrypted_refresh_token='v1.new.iv.tag.syntheticgoogle') then raise exception 'FAIL: Google connection updated incorrectly'; end if;
end $$;
reset role;
select 'PASS: rotation SQL grants, guarded updates, and stale-write rejection' as result;
rollback;
