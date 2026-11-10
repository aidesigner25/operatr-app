-- ONLY run on the disposable rotation test project initialized earlier.
-- Creates persistent test-only helper functions. The app never uses them.
begin;
do $$
begin
  if to_regclass('public.operatr_rotation_lab_marker') is null then
    raise exception 'STOP: rotation lab marker absent; choose the disposable test project.';
  end if;
  if not exists(select 1 from public.operatr_rotation_lab_marker where marker='operatr-rotation-lab-only-v1') then
    raise exception 'STOP: invalid rotation lab marker; choose the disposable test project.';
  end if;
end $$;

-- Lock the synthetic fixture before publishing an advisory-lock signal. The
-- sleep is fixed and short; it is never used with real application records.
create or replace function public.operatr_lab_hold_rotation_row(p_id uuid, p_lock_key bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_lock_key < 1 or p_lock_key > 2147483647 then raise exception 'Invalid lab lock key'; end if;
  perform 1 from public.vault_credentials where id=p_id for update;
  if not found then raise exception 'Lab record missing'; end if;
  perform pg_catalog.pg_advisory_xact_lock(p_lock_key);
  perform pg_catalog.pg_sleep(6);
  return true;
end $$;

-- Probe whether the holder has acquired the advisory lock. If the lock was
-- free, immediately release the probe's session-level lock before returning.
create or replace function public.operatr_lab_rotation_lock_held(p_lock_key bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_lock_key < 1 or p_lock_key > 2147483647 then raise exception 'Invalid lab lock key'; end if;
  if pg_catalog.pg_try_advisory_lock(p_lock_key) then
    perform pg_catalog.pg_advisory_unlock(p_lock_key);
    return false;
  end if;
  return true;
end $$;
revoke all on function public.operatr_lab_hold_rotation_row(uuid,bigint) from public, anon, authenticated;
revoke all on function public.operatr_lab_rotation_lock_held(bigint) from public, anon, authenticated;
grant execute on function public.operatr_lab_hold_rotation_row(uuid,bigint) to service_role;
grant execute on function public.operatr_lab_rotation_lock_held(bigint) to service_role;
do $$
begin
  if has_function_privilege('anon', 'public.operatr_lab_hold_rotation_row(uuid,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.operatr_lab_hold_rotation_row(uuid,bigint)', 'EXECUTE')
     or has_function_privilege('anon', 'public.operatr_lab_rotation_lock_held(bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.operatr_lab_rotation_lock_held(bigint)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.operatr_lab_hold_rotation_row(uuid,bigint)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.operatr_lab_rotation_lock_held(bigint)', 'EXECUTE') then
    raise exception 'FAIL: concurrency helper grants are not restricted as intended';
  end if;
end $$;
commit;
select 'PASS: disposable rotation concurrency helpers initialized' as result;
