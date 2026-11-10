-- DISPOSABLE MARKED ROTATION PROJECT ONLY. Run the entire script in one SQL
-- editor execution. Schema changes and synthetic records are rolled back.
-- Never run this in the Operatr project. No real credentials are used.
begin;
do $$
begin
 if to_regclass('public.operatr_rotation_lab_marker') is null then raise exception 'STOP: disposable project marker missing'; end if;
 if not exists (select 1 from public.operatr_rotation_lab_marker where marker='operatr-rotation-lab-only-v1') then raise exception 'STOP: invalid marker'; end if;
 if to_regclass('public.vault_credentials') is null or to_regclass('public.google_workspace_connections') is null then raise exception 'STOP: rotation lab tables missing'; end if;
 if exists (select 1 from auth.users) then raise exception 'STOP: disposable project must have no Auth users'; end if;
 if exists (select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created' and not tgisinternal) then raise exception 'STOP: existing auth trigger'; end if;
 if to_regclass('public.profiles') is not null or to_regclass('public.vault_audit_events') is not null or to_regclass('public.chat_conversations') is not null or to_regclass('public.chat_messages') is not null or to_regclass('public.chat_agent_runs') is not null or to_regclass('public.chat_agent_run_events') is not null or to_regclass('public.chat_value_estimates') is not null or to_regclass('public.operatr_lab_saved_vault') is not null or to_regclass('public.operatr_lab_saved_google') is not null then raise exception 'STOP: unexpected pre-existing tables'; end if;
end $$;
alter table public.vault_credentials rename to operatr_lab_saved_vault;
alter table public.google_workspace_connections rename to operatr_lab_saved_google;

-- BEGIN EXACT MIGRATION: 202610280001_phase1_identity_vault.sql
-- Phase 1: identity-owned records and encrypted BYOK credential metadata.
-- The encrypted_credential column is application-encrypted AES-256-GCM text;
-- plaintext credentials must never be inserted into this database.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.vault_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'xai', 'tavily', 'apify')),
  encrypted_credential text not null check (encrypted_credential like 'v1.%'),
  encryption_version smallint not null check (encryption_version = 1),
  key_id text not null check (char_length(key_id) between 1 and 100),
  last_four text not null check (char_length(last_four) between 1 and 4),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, provider)
);

create table if not exists public.vault_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text check (provider is null or provider in ('openai', 'anthropic', 'google', 'xai', 'tavily', 'apify')),
  action text not null check (action in ('upserted', 'deleted', 'purged_all')),
  request_id text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists vault_credentials_user_id_idx on public.vault_credentials(user_id);
create index if not exists vault_audit_events_user_id_created_at_idx on public.vault_audit_events(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.vault_credentials enable row level security;
alter table public.vault_audit_events enable row level security;

-- Idempotent policy creation makes the migration safe to retry locally.
drop policy if exists "profiles are private to their owner" on public.profiles;
create policy "profiles are private to their owner"
  on public.profiles for all
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "vault credentials are private to their owner" on public.vault_credentials;
create policy "vault credentials are private to their owner"
  on public.vault_credentials for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "vault audit events are private to their owner" on public.vault_audit_events;
create policy "vault audit events are private to their owner"
  on public.vault_audit_events for select
  using ((select auth.uid()) = user_id);

drop policy if exists "vault audit events can be inserted by their owner" on public.vault_audit_events;
create policy "vault audit events can be inserted by their owner"
  on public.vault_audit_events for insert
  with check ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists vault_credentials_set_updated_at on public.vault_credentials;
create trigger vault_credentials_set_updated_at
  before update on public.vault_credentials
  for each row execute function public.set_updated_at();

-- Create a minimal, owner-scoped profile for each Supabase Auth user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Existing users (if any) get a row without widening access.
insert into public.profiles (id, display_name)
select id, nullif(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (id) do nothing;

-- END EXACT MIGRATION: 202610280001_phase1_identity_vault.sql

-- BEGIN EXACT MIGRATION: 202610280002_phase2_chat_runtime.sql
-- Phase 2: user-scoped persisted chat. Message content may contain private work,
-- so every record carries its owner and is protected by RLS.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'xai')),
  model text not null check (char_length(model) between 1 and 200),
  response_style text not null default 'medium' check (response_style in ('concise', 'medium', 'deep')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 50000),
  status text not null default 'completed' check (status in ('streaming', 'completed', 'cancelled', 'failed')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations(user_id, updated_at desc);
create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages(conversation_id, created_at asc);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat conversations are private to their owner" on public.chat_conversations;
create policy "chat conversations are private to their owner"
  on public.chat_conversations for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "chat messages are private to their owner" on public.chat_messages;
create policy "chat messages are private to their owner"
  on public.chat_messages for select
  using ((select auth.uid()) = user_id);

drop policy if exists "chat messages can be inserted only into an owned conversation" on public.chat_messages;
create policy "chat messages can be inserted only into an owned conversation"
  on public.chat_messages for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.chat_conversations
      where chat_conversations.id = conversation_id
        and chat_conversations.user_id = (select auth.uid())
    )
  );

drop policy if exists "chat messages can be updated only by their owner" on public.chat_messages;
create policy "chat messages can be updated only by their owner"
  on public.chat_messages for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.chat_conversations
      where chat_conversations.id = conversation_id
        and chat_conversations.user_id = (select auth.uid())
    )
  );

drop policy if exists "chat messages can be deleted only by their owner" on public.chat_messages;
create policy "chat messages can be deleted only by their owner"
  on public.chat_messages for delete
  using ((select auth.uid()) = user_id);

drop trigger if exists chat_conversations_set_updated_at on public.chat_conversations;
create trigger chat_conversations_set_updated_at
  before update on public.chat_conversations
  for each row execute function public.set_updated_at();

drop trigger if exists chat_messages_set_updated_at on public.chat_messages;
create trigger chat_messages_set_updated_at
  before update on public.chat_messages
  for each row execute function public.set_updated_at();

-- END EXACT MIGRATION: 202610280002_phase2_chat_runtime.sql

-- BEGIN EXACT MIGRATION: 202610290001_phase3_agent_runtime.sql
-- Phase 3: bounded, auditable execution metadata. This records operational
-- state only; it never stores credentials, chain-of-thought, or provider payloads.

create table if not exists public.chat_agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'xai')),
  model text not null check (char_length(model) between 1 and 200),
  response_style text not null check (response_style in ('concise', 'medium', 'deep')),
  status text not null check (status in ('running', 'completed', 'cancelled', 'failed', 'timed_out')),
  max_output_tokens integer not null check (max_output_tokens between 1 and 10000),
  input_characters integer not null default 0 check (input_characters >= 0),
  output_characters integer not null default 0 check (output_characters >= 0),
  retry_count integer not null default 0 check (retry_count between 0 and 1),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  started_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create table if not exists public.chat_agent_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.chat_agent_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('preparing', 'generating', 'retrying', 'saving', 'completed', 'cancelled', 'failed', 'timed_out')),
  detail text not null check (char_length(detail) between 1 and 160),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists chat_agent_runs_conversation_started_idx
  on public.chat_agent_runs(conversation_id, started_at desc);
create index if not exists chat_agent_run_events_run_created_idx
  on public.chat_agent_run_events(run_id, created_at asc);

alter table public.chat_agent_runs enable row level security;
alter table public.chat_agent_run_events enable row level security;

drop policy if exists "agent runs are private to their owner" on public.chat_agent_runs;
create policy "agent runs are private to their owner"
  on public.chat_agent_runs for all
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.chat_conversations
      where chat_conversations.id = conversation_id
        and chat_conversations.user_id = (select auth.uid())
    )
  );

drop policy if exists "agent run events are private to their owner" on public.chat_agent_run_events;
create policy "agent run events are private to their owner"
  on public.chat_agent_run_events for all
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.chat_agent_runs
      where chat_agent_runs.id = run_id
        and chat_agent_runs.user_id = (select auth.uid())
    )
  );

-- END EXACT MIGRATION: 202610290001_phase3_agent_runtime.sql

-- BEGIN EXACT MIGRATION: 202610290002_profile_preferences.sql
-- Profile and operator preferences remain private to the authenticated owner.
-- Avatar uploads are intentionally bounded data URLs for this private POC; no
-- public storage bucket or credential-bearing upload path is introduced.

alter table public.profiles
  add column if not exists organization_name text,
  add column if not exists avatar_choice text,
  add column if not exists avatar_data_url text,
  add column if not exists hourly_rate numeric(10, 2),
  add column if not exists business_goals text,
  add column if not exists writing_sample text,
  add column if not exists agent_instructions text;

alter table public.profiles
  drop constraint if exists profiles_display_name_length,
  drop constraint if exists profiles_organization_name_length,
  drop constraint if exists profiles_avatar_choice,
  drop constraint if exists profiles_avatar_data_url_length,
  drop constraint if exists profiles_hourly_rate_range;

alter table public.profiles
  add constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 80),
  add constraint profiles_organization_name_length check (organization_name is null or char_length(organization_name) <= 160),
  add constraint profiles_avatar_choice check (avatar_choice is null or avatar_choice in ('muse', 'forge', 'ember', 'orbit', 'sage', 'arc')),
  add constraint profiles_avatar_data_url_length check (avatar_data_url is null or char_length(avatar_data_url) <= 2100000),
  add constraint profiles_hourly_rate_range check (hourly_rate is null or (hourly_rate >= 0 and hourly_rate <= 1000000));

-- END EXACT MIGRATION: 202610290002_profile_preferences.sql

-- BEGIN EXACT MIGRATION: 202611030001_phase4_openrouter.sql
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

-- END EXACT MIGRATION: 202611030001_phase4_openrouter.sql

-- BEGIN EXACT MIGRATION: 202611040001_google_workspace.sql
-- Google OAuth refresh tokens are encrypted by the application, with an AAD
-- distinct from Gemini keys. Each user has at most one Workspace connection.
create table if not exists public.google_workspace_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_refresh_token text not null check (encrypted_refresh_token like 'v1.%'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.google_workspace_connections enable row level security;
drop policy if exists "google workspace connections are private to their owner" on public.google_workspace_connections;
create policy "google workspace connections are private to their owner"
  on public.google_workspace_connections for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop trigger if exists google_workspace_connections_set_updated_at on public.google_workspace_connections;
create trigger google_workspace_connections_set_updated_at before update on public.google_workspace_connections
  for each row execute function public.set_updated_at();

-- END EXACT MIGRATION: 202611040001_google_workspace.sql

-- BEGIN EXACT MIGRATION: 202611040002_value_estimates.sql
-- Automated assessments and user overrides, one per completed response.
-- Values use the hourly-rate snapshot saved with each estimate.
create table if not exists public.chat_value_estimates (
  message_id uuid primary key references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  minutes_saved integer not null check (minutes_saved between 0 and 60000),
  hourly_rate numeric(12,2) not null check (hourly_rate between 0 and 1000000),
  source text not null check (source in ('model', 'user', 'not_applicable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'not_applicable' and minutes_saved = 0) or (source in ('model', 'user') and minutes_saved > 0))
);
create index if not exists chat_value_estimates_owner_created_idx on public.chat_value_estimates(user_id, created_at desc);
create index if not exists chat_value_estimates_owner_conversation_idx on public.chat_value_estimates(user_id, conversation_id);
alter table public.chat_value_estimates enable row level security;
drop policy if exists "value estimates are private to their owner" on public.chat_value_estimates;
create policy "value estimates are private to their owner" on public.chat_value_estimates for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.chat_messages where chat_messages.id = message_id
    and chat_messages.conversation_id = chat_value_estimates.conversation_id
    and chat_messages.user_id = (select auth.uid()) and chat_messages.role = 'assistant' and chat_messages.status = 'completed'
  ));
drop trigger if exists chat_value_estimates_set_updated_at on public.chat_value_estimates;
create trigger chat_value_estimates_set_updated_at before update on public.chat_value_estimates
  for each row execute function public.set_updated_at();

create or replace function public.value_estimate_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with estimates as (
    select minutes_saved, hourly_rate, created_at from public.chat_value_estimates
    where user_id = (select auth.uid()) and minutes_saved > 0
  ), monthly as (
    select to_char(date_trunc('month', created_at at time zone 'UTC'), 'YYYY-MM') as month,
      sum(minutes_saved) as minutes, round(sum(round(minutes_saved * hourly_rate / 60, 2)), 2) as value
    from estimates
    where created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' - interval '5 months'
    group by 1
  )
  select jsonb_build_object(
    'count', (select count(*) from estimates),
    'minutes', (select coalesce(sum(minutes_saved), 0) from estimates),
    'value', (select coalesce(round(sum(round(minutes_saved * hourly_rate / 60, 2)), 2), 0) from estimates),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', month, 'minutes', minutes, 'value', value) order by month), '[]'::jsonb) from monthly)
  );
$$;
revoke all on function public.value_estimate_summary() from public, anon;
grant execute on function public.value_estimate_summary() to authenticated;

-- END EXACT MIGRATION: 202611040002_value_estimates.sql

-- BEGIN EXACT MIGRATION: 202611050001_value_trajectory.sql
-- Per-user totals and calendar buckets in the viewer's selected IANA time zone.
create or replace function public.value_estimate_summary_local(p_timezone text default 'UTC')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with zone as (
    select coalesce((select name from pg_catalog.pg_timezone_names where name = p_timezone limit 1), 'UTC') as name
  ), bounds as (
    select name, (now() at time zone name)::date as today from zone
  ), estimates as (
    select e.minutes_saved, e.hourly_rate, (e.created_at at time zone b.name)::date as local_day
    from public.chat_value_estimates e cross join bounds b
    where e.user_id = (select auth.uid()) and e.minutes_saved > 0
  ), monthly as (
    select date_trunc('month', local_day::timestamp)::date as month,
      sum(minutes_saved) as minutes, sum(round(minutes_saved * hourly_rate / 60, 2)) as value
    from estimates group by 1
  ), daily as (
    select local_day, sum(minutes_saved) as minutes,
      sum(round(minutes_saved * hourly_rate / 60, 2)) as value
    from estimates group by 1
  ), months as (
    select to_char(m.start, 'YYYY-MM') as month, coalesce(x.minutes, 0) as minutes, coalesce(x.value, 0) as value
    from bounds b cross join lateral generate_series(date_trunc('month', b.today::timestamp) - interval '5 months', date_trunc('month', b.today::timestamp), interval '1 month') m(start)
    left join monthly x on x.month = m.start::date
  ), days as (
    select d.start::date as day, coalesce(x.minutes, 0) as minutes, coalesce(x.value, 0) as value
    from bounds b cross join lateral generate_series(date_trunc('week', b.today::timestamp), date_trunc('week', b.today::timestamp) + interval '6 days', interval '1 day') d(start)
    left join daily x on x.local_day = d.start::date
  )
  select jsonb_build_object(
    'count', (select count(*) from estimates),
    'minutes', (select coalesce(sum(minutes_saved), 0) from estimates),
    'value', (select coalesce(sum(round(minutes_saved * hourly_rate / 60, 2)), 0) from estimates),
    'timezone', (select name from bounds),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', month, 'minutes', minutes, 'value', value) order by month), '[]'::jsonb) from months),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'minutes', minutes, 'value', value) order by day), '[]'::jsonb) from days)
  );
$$;
revoke all on function public.value_estimate_summary_local(text) from public, anon;
grant execute on function public.value_estimate_summary_local(text) to authenticated;

-- END EXACT MIGRATION: 202611050001_value_trajectory.sql

-- BEGIN EXACT MIGRATION: 202611050002_credential_rotation_guards.sql
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

-- END EXACT MIGRATION: 202611050002_credential_rotation_guards.sql

-- Reproduce the excessive grants observed in Operatr before applying the candidate.
do $$
declare t text;
begin
 foreach t in array array['profiles','vault_credentials','vault_audit_events','chat_conversations','chat_messages','chat_agent_runs','chat_agent_run_events','google_workspace_connections','chat_value_estimates'] loop
   execute format('grant all privileges on table public.%I to anon, authenticated',t);
 end loop;
end $$;

-- BEGIN EXACT GRANT CANDIDATE
-- PROPOSED ONLY: Do not run on the Operatr project until the disposable
-- project test and compatibility checks pass and the change is reviewed.
-- This one DO statement is atomic: any failed verification rolls it back.
-- No tables, rows, policies, functions, service_role grants, or sequences are
-- created or modified. Normal authenticated CRUD is retained except UPDATE
-- and DELETE on vault audit events, where current RLS has no such policies.
-- An inherited PUBLIC/other-role grant can defeat a revoke; the effective-grant
-- assertions detect that and abort rather than silently declaring success.
do $$
declare
  t text;
  privilege_name text;
  allowed boolean;
  table_names text[] := array[
    'profiles','vault_credentials','vault_audit_events','chat_conversations',
    'chat_messages','chat_agent_runs','chat_agent_run_events',
    'google_workspace_connections','chat_value_estimates'
  ];
begin
  foreach t in array table_names loop
    if to_regclass(format('public.%I',t)) is null then
      raise exception 'Missing required table: %', t;
    end if;
    -- Anonymous access is not needed for these nine user-owned tables.
    execute format('revoke all privileges on table public.%I from anon',t);
    -- Preserve authenticated SELECT/INSERT/UPDATE/DELETE for app workflows.
    execute format('revoke truncate, references, trigger on table public.%I from authenticated',t);
    if current_setting('server_version_num')::integer >= 170000 then
      execute format('revoke maintain on table public.%I from authenticated',t);
    end if;
  end loop;
  -- Existing policies allow only owner-scoped audit SELECT and INSERT.
  revoke update, delete on table public.vault_audit_events from authenticated;

  foreach t in array table_names loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon',format('public.%I',t),privilege_name) then
        raise exception 'Anonymous role still inherits % on %; inspect role membership/PUBLIC grants',privilege_name,t;
      end if;
    end loop;
    foreach privilege_name in array array['TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated',format('public.%I',t),privilege_name) then
        raise exception 'Authenticated role still inherits % on %; inspect role membership/PUBLIC grants',privilege_name,t;
      end if;
    end loop;
    if current_setting('server_version_num')::integer >= 170000 then
      execute 'select has_table_privilege($1,$2,$3)' into allowed using 'anon',format('public.%I',t),'MAINTAIN';
      if allowed then raise exception 'Anonymous role still inherits MAINTAIN on %',t; end if;
      execute 'select has_table_privilege($1,$2,$3)' into allowed using 'authenticated',format('public.%I',t),'MAINTAIN';
      if allowed then raise exception 'Authenticated role still inherits MAINTAIN on %',t; end if;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.vault_audit_events','UPDATE') or has_table_privilege('authenticated','public.vault_audit_events','DELETE') then
    raise exception 'Authenticated role still inherits audit UPDATE or DELETE';
  end if;
end $$;

-- END EXACT GRANT CANDIDATE

-- Synthetic Auth users fire the actual profile creation trigger. All test data
-- is rolled back; encrypted strings below are placeholders, never real keys.
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000001','grant-lab-one@example.invalid','{"display_name":"Lab One"}',now(),now()),
       ('10000000-0000-0000-0000-000000000002','grant-lab-two@example.invalid','{"display_name":"Lab Two"}',now(),now());
set local role authenticated;
do $$
declare
 i integer; owner_id uuid; other_id uuid; conversation_id uuid; message_id uuid; run_id uuid;
 n integer; totals jsonb;
begin
 for i in 1..2 loop
   owner_id := ('10000000-0000-0000-0000-00000000000' || i)::uuid;
   conversation_id := ('20000000-0000-0000-0000-00000000000' || i)::uuid;
   message_id := ('30000000-0000-0000-0000-00000000000' || i)::uuid;
   run_id := ('40000000-0000-0000-0000-00000000000' || i)::uuid;
   perform set_config('request.jwt.claim.sub',owner_id::text,true);
   perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
   if auth.uid() is distinct from owner_id then raise exception 'FAIL: identity setup'; end if;
   update public.profiles set display_name='Updated Lab', hourly_rate=100 where id=owner_id;
   get diagnostics n = row_count; if n<>1 then raise exception 'FAIL: profile update'; end if;
   insert into public.chat_conversations(id,user_id,title,provider,model) values(conversation_id,owner_id,'Lab chat','openai','lab-model');
   update public.chat_conversations set title='Renamed lab chat' where id=conversation_id;
   insert into public.chat_messages(id,conversation_id,user_id,role,content,status) values(message_id,conversation_id,owner_id,'assistant','Synthetic message','completed');
   insert into public.chat_agent_runs(id,conversation_id,user_id,provider,model,response_style,status,max_output_tokens) values(run_id,conversation_id,owner_id,'openai','lab-model','medium','completed',100);
   insert into public.chat_agent_run_events(run_id,user_id,stage,detail) values(run_id,owner_id,'completed','Synthetic event');
   insert into public.chat_value_estimates(message_id,conversation_id,user_id,minutes_saved,hourly_rate,source) values(message_id,conversation_id,owner_id,60,100,'model');
   update public.chat_value_estimates set minutes_saved=90,source='user' where chat_value_estimates.user_id=owner_id;
   totals:=public.value_estimate_summary_local('UTC');
   if (totals->>'minutes')::integer <> 90 then raise exception 'FAIL: dashboard summary'; end if;
   insert into public.vault_credentials(user_id,provider,encrypted_credential,encryption_version,key_id,last_four) values(owner_id,'openai','v1.synthetic',1,'lab','test')
     on conflict(user_id,provider) do update set encrypted_credential=excluded.encrypted_credential;
   insert into public.vault_audit_events(user_id,provider,action,request_id) values(owner_id,'openai','upserted','synthetic');
   insert into public.google_workspace_connections(user_id,encrypted_refresh_token) values(owner_id,'v1.synthetic')
     on conflict(user_id) do update set encrypted_refresh_token=excluded.encrypted_refresh_token;
   delete from public.google_workspace_connections where user_id=owner_id;
   get diagnostics n = row_count; if n<>1 then raise exception 'FAIL: disconnect'; end if;
   insert into public.google_workspace_connections(user_id,encrypted_refresh_token) values(owner_id,'v1.synthetic');
 end loop;
 for i in 1..2 loop
   owner_id := ('10000000-0000-0000-0000-00000000000' || i)::uuid;
   other_id := ('10000000-0000-0000-0000-00000000000' || (3-i))::uuid;
   perform set_config('request.jwt.claim.sub',owner_id::text,true);
   perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
   if exists(select 1 from public.profiles where id=other_id) or exists(select 1 from public.chat_conversations where user_id=other_id) or exists(select 1 from public.chat_messages where user_id=other_id) or exists(select 1 from public.chat_agent_runs where user_id=other_id) or exists(select 1 from public.chat_agent_run_events where user_id=other_id) or exists(select 1 from public.chat_value_estimates where user_id=other_id) or exists(select 1 from public.vault_credentials where user_id=other_id) or exists(select 1 from public.vault_audit_events where user_id=other_id) or exists(select 1 from public.google_workspace_connections where user_id=other_id) then raise exception 'FAIL: cross-account read'; end if;
   update public.chat_conversations set title='Forbidden' where user_id=other_id;
   get diagnostics n = row_count; if n<>0 then raise exception 'FAIL: cross-account update'; end if;
 end loop;
end $$;
reset role;
select 'PASS: migration-defined schema accepted the grant changes and both synthetic accounts passed database workflow and isolation checks' as result;
rollback;
