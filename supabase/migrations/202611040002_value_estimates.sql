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
