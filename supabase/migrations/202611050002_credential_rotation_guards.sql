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
