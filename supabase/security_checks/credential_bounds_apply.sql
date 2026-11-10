-- ACTUAL OPERATR PROJECT ONLY; select the project explicitly in SQL Editor.
-- No credentials, ciphertext, or other row data are edited.
begin;
do $$ begin
 if to_regclass('public.vault_credentials') is null or to_regclass('public.google_workspace_connections') is null then raise exception 'STOP: required credential tables missing'; end if;
 if to_regclass('public.operatr_full_recovery_lab_marker') is not null or to_regclass('public.operatr_rotation_lab_marker') is not null then raise exception 'STOP: test-project marker detected'; end if;
 if exists(select 1 from pg_constraint where (conrelid='public.vault_credentials'::regclass and conname='vault_encrypted_credential_length') or (conrelid='public.google_workspace_connections'::regclass and conname='google_encrypted_refresh_token_length')) then raise exception 'STOP: proposed constraint name already present'; end if;
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
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.vault_credentials'::regclass and conname='vault_encrypted_credential_length' and convalidated) or not exists(select 1 from pg_constraint where conrelid='public.google_workspace_connections'::regclass and conname='google_encrypted_refresh_token_length' and convalidated) then raise exception 'FAIL: credential bounds not validated'; end if;
end $$;
commit;
select 'PASS: vault and Google ciphertext size bounds applied and validated' as result;
