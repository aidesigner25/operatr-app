-- CANDIDATE: security events for credential mutations. Test and
-- validate rollout/recovery before applying to any real project. Historic
-- vault_audit_events remain user-influenced and are not converted.
create table public.vault_security_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_kind text not null check (object_kind in ('vault_credential','google_connection')),
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  created_at timestamptz not null default now()
);
create index vault_security_events_owner_created_idx
  on public.vault_security_events(owner_id, created_at desc);
alter table public.vault_security_events enable row level security;
revoke all on public.vault_security_events from public, anon, authenticated, service_role;
grant select on public.vault_security_events to authenticated, service_role;
create policy "owners read their credential security events"
  on public.vault_security_events for select to authenticated
  using ((select auth.uid()) = owner_id);

-- Only the owner of this narrowly scoped SECURITY DEFINER function writes
-- audit rows. Its owning role and table privileges must be verified on the
-- target; no external input or secret values are copied into events.
create function public.record_credential_security_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_kind text;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('vault_credentials','google_workspace_connections') then raise exception 'unexpected audit source'; end if;
 if tg_op='DELETE' then v_owner:=old.user_id; else v_owner:=new.user_id; end if;
 -- Cascading account deletion removes both source records and their events.
 -- Skip creating an event once the deleted Auth parent is no longer visible.
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=v_owner) then return old; end if;
 v_kind:=case when tg_table_name='vault_credentials' then 'vault_credential' else 'google_connection' end;
 insert into public.vault_security_events(owner_id,object_kind,operation) values(v_owner,v_kind,tg_op);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.record_credential_security_event() from public, anon, authenticated, service_role;
create trigger vault_security_event after insert or update or delete on public.vault_credentials
  for each row execute function public.record_credential_security_event();
create trigger google_connection_security_event after insert or update or delete on public.google_workspace_connections
  for each row execute function public.record_credential_security_event();
