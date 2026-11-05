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
