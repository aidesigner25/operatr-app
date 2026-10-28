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
