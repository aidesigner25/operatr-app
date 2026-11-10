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
