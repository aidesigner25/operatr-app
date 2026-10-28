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
