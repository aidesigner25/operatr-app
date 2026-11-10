-- READ ONLY: aggregate counts only. Does not display keys, tokens, ciphertext,
-- user IDs, individual lengths, or other row contents.
select
 (select count(*) from public.vault_credentials where char_length(encrypted_credential)>20000) as vault_values_over_limit,
 (select count(*) from public.google_workspace_connections where char_length(encrypted_refresh_token)>20000) as google_values_over_limit,
 (select count(*) from public.google_workspace_connections where char_length(split_part(encrypted_refresh_token,'.',2))>100) as google_key_ids_over_100_characters;
