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
