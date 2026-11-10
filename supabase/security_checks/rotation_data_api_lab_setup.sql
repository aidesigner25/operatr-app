-- SETUP FOR AN EMPTY DISPOSABLE SUPABASE PROJECT ONLY.
-- This intentionally creates persistent *test-only* tables and functions in
-- that project. Never run it in your existing Operatr project. No real keys,
-- users or application data are needed or imported. Confirm the project name.
begin;
do $$
begin
  if to_regclass('public.vault_credentials') is not null or to_regclass('public.google_workspace_connections') is not null
     or to_regclass('public.operatr_rotation_lab_marker') is not null
     or to_regprocedure('public.operatr_rotation_role_check()') is not null
     or to_regprocedure('public.operatr_rotate_vault_credential(uuid,uuid,text,timestamptz,text,text,smallint,text,text,smallint)') is not null
     or to_regprocedure('public.operatr_rotate_google_connection(uuid,timestamptz,text,text)') is not null then
    raise exception 'STOP: Existing Operatr tables or functions found; choose a NEW EMPTY test project.';
  end if;
end $$;
create table public.vault_credentials (
 id uuid primary key, user_id uuid not null, provider text not null,
 encrypted_credential text not null check (encrypted_credential like 'v1.%'),
 key_id text not null check (char_length(key_id) between 1 and 100),
 encryption_version smallint not null check (encryption_version=1),
 last_four text not null check (char_length(last_four) between 1 and 4),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id, provider)
);
create table public.google_workspace_connections (
 user_id uuid primary key, encrypted_refresh_token text not null check (encrypted_refresh_token like 'v1.%'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.operatr_lab_update_timestamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at=timezone('utc'::text, now()); return new; end $$;
create trigger operatr_lab_vault_timestamp before update on public.vault_credentials for each row execute function public.operatr_lab_update_timestamp();
create trigger operatr_lab_google_timestamp before update on public.google_workspace_connections for each row execute function public.operatr_lab_update_timestamp();
alter table public.vault_credentials enable row level security;
alter table public.google_workspace_connections enable row level security;
revoke all on public.vault_credentials, public.google_workspace_connections from public, anon, authenticated;
grant select,insert,update,delete on public.vault_credentials, public.google_workspace_connections to service_role;
create table public.operatr_rotation_lab_marker (marker text primary key);
alter table public.operatr_rotation_lab_marker enable row level security;
insert into public.operatr_rotation_lab_marker values ('operatr-rotation-lab-only-v1');
revoke all on public.operatr_rotation_lab_marker from public, anon, authenticated;
grant select on public.operatr_rotation_lab_marker to service_role;

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

commit;
select 'PASS: disposable rotation Data API lab initialized' as result;
