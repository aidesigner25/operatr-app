-- LOCAL SYNTHETIC FULL-RECOVERY RESTORE TARGET ONLY. Rolls back all changes.
begin;
do $$ begin
 if to_regclass('public.operatr_full_recovery_lab_marker') is null then raise exception 'STOP: lab marker missing'; end if;
 if not exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') then raise exception 'STOP: wrong target'; end if;
 if exists(select 1 from pg_constraint where conname in ('vault_encrypted_credential_length','google_encrypted_refresh_token_length') and conrelid in ('public.vault_credentials'::regclass,'public.google_workspace_connections'::regclass)) then raise exception 'STOP: proposed constraints already present'; end if;
end $$;
-- BEGIN EXACT MIGRATION
-- Defense in depth for direct owner-scoped Supabase Data API writes.
-- The app accepts at most 4096 UTF-16 code units for provider credentials and
-- Google refresh tokens. The 20,000-character ciphertext ceiling leaves room
-- for UTF-8/base64url expansion and framing with a key ID of up to 100
-- characters. The Google path does not currently enforce that key ID bound;
-- verify configuration before applying this migration.
-- This size check does not prove ciphertext authenticity or valid encryption.
-- Validation fails instead of truncating any existing over-limit value.
alter table public.vault_credentials
  add constraint vault_encrypted_credential_length
    check (char_length(encrypted_credential) <= 20000) not valid;
alter table public.google_workspace_connections
  add constraint google_encrypted_refresh_token_length
    check (char_length(encrypted_refresh_token) <= 20000) not valid;
alter table public.vault_credentials validate constraint vault_encrypted_credential_length;
alter table public.google_workspace_connections validate constraint google_encrypted_refresh_token_length;

-- END EXACT MIGRATION
set local role authenticated;
do $$
declare owner_id uuid := 'a0000000-0000-4000-8000-000000000001'; n integer; rejected boolean;
begin
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 update public.vault_credentials set encrypted_credential='v1.' || repeat('a',19997) where user_id=owner_id and provider='openai';
 get diagnostics n = row_count; if n<>1 then raise exception 'FAIL: maximum-length own vault update'; end if;
 update public.google_workspace_connections set encrypted_refresh_token='v1.' || repeat('a',19997) where user_id=owner_id;
 get diagnostics n = row_count; if n<>1 then raise exception 'FAIL: maximum-length own Google update'; end if;
 rejected:=false;
 begin update public.vault_credentials set encrypted_credential='v1.' || repeat('a',19998) where user_id=owner_id and provider='openai'; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'FAIL: oversized vault value accepted'; end if;
 rejected:=false;
 begin update public.google_workspace_connections set encrypted_refresh_token='v1.' || repeat('a',19998) where user_id=owner_id; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'FAIL: oversized Google value accepted'; end if;
end $$;
reset role;
rollback;
select 'PASS: ciphertext size bounds allow in-limit writes and reject oversized writes; changes rolled back' as result;
