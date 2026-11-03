-- Phase 4: OpenRouter is a first-class BYOK chat provider. Existing
-- owner-scoped rows and RLS policies are unchanged; only provider allowlists
-- expand so the encrypted vault, conversations, and run metadata agree.

alter table public.vault_credentials
  drop constraint if exists vault_credentials_provider_check;
alter table public.vault_credentials
  add constraint vault_credentials_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'xai', 'openrouter', 'tavily', 'apify'));

alter table public.vault_audit_events
  drop constraint if exists vault_audit_events_provider_check;
alter table public.vault_audit_events
  add constraint vault_audit_events_provider_check
  check (provider is null or provider in ('openai', 'anthropic', 'google', 'xai', 'openrouter', 'tavily', 'apify'));

alter table public.chat_conversations
  drop constraint if exists chat_conversations_provider_check;
alter table public.chat_conversations
  add constraint chat_conversations_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'xai', 'openrouter'));

alter table public.chat_agent_runs
  drop constraint if exists chat_agent_runs_provider_check;
alter table public.chat_agent_runs
  add constraint chat_agent_runs_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'xai', 'openrouter'));
