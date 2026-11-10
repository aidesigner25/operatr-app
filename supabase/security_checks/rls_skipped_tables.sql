-- Follow-up for previously skipped SELECT checks. Use the same two test accounts.
-- Replace the UUID placeholders below; run the ENTIRE script at once. Synthetic
-- records exist only within this transaction and ROLLBACK removes them. Existing
-- Google connections are never updated or deleted. No actual token is used.
-- If it errors, the transaction aborts: report a sanitized error, not a PASS.
-- This covers SELECT only under simulated database roles, not API or write access.
begin;
select set_config('operatr_check.user_a', 'USER_A_UUID', true);
select set_config('operatr_check.user_b', 'USER_B_UUID', true);
select set_config('operatr_check.chat_a', gen_random_uuid()::text, true);
select set_config('operatr_check.chat_b', gen_random_uuid()::text, true);
select set_config('operatr_check.msg_a', gen_random_uuid()::text, true);
select set_config('operatr_check.msg_b', gen_random_uuid()::text, true);

do $$
declare a uuid := current_setting('operatr_check.user_a')::uuid;
        b uuid := current_setting('operatr_check.user_b')::uuid;
begin
  if a = b then raise exception 'INCONCLUSIVE: select two distinct accounts'; end if;
  if not exists (select 1 from public.profiles where id = a) or not exists (select 1 from public.profiles where id = b) then
    raise exception 'INCONCLUSIVE: one or both test profiles do not exist';
  end if;
end $$;

-- Create estimates attached only to new synthetic completed messages.
insert into public.chat_conversations (id, user_id, title, provider, model, response_style)
values (current_setting('operatr_check.chat_a')::uuid, current_setting('operatr_check.user_a')::uuid, 'RLS estimate fixture A', 'openai', 'test-model', 'medium'),
       (current_setting('operatr_check.chat_b')::uuid, current_setting('operatr_check.user_b')::uuid, 'RLS estimate fixture B', 'openai', 'test-model', 'medium');
insert into public.chat_messages (id, conversation_id, user_id, role, content, status)
values (current_setting('operatr_check.msg_a')::uuid, current_setting('operatr_check.chat_a')::uuid, current_setting('operatr_check.user_a')::uuid, 'assistant', 'RLS estimate fixture A', 'completed'),
       (current_setting('operatr_check.msg_b')::uuid, current_setting('operatr_check.chat_b')::uuid, current_setting('operatr_check.user_b')::uuid, 'assistant', 'RLS estimate fixture B', 'completed');
insert into public.chat_value_estimates (message_id, conversation_id, user_id, minutes_saved, hourly_rate, source)
values (current_setting('operatr_check.msg_a')::uuid, current_setting('operatr_check.chat_a')::uuid, current_setting('operatr_check.user_a')::uuid, 30, 100, 'user'),
       (current_setting('operatr_check.msg_b')::uuid, current_setting('operatr_check.chat_b')::uuid, current_setting('operatr_check.user_b')::uuid, 30, 100, 'user');

-- A synthetic connection is inserted only if an account has none. No update,
-- upsert, revocation or replacement of an existing connection is performed.
insert into public.google_workspace_connections (user_id, encrypted_refresh_token)
select target.user_id, 'v1.synthetic-test-only'
from (values (current_setting('operatr_check.user_a')::uuid),
             (current_setting('operatr_check.user_b')::uuid)) as target(user_id)
where not exists (select 1 from public.google_workspace_connections g where g.user_id = target.user_id);

set local role authenticated;
do $$
declare
  a uuid := current_setting('operatr_check.user_a')::uuid;
  b uuid := current_setting('operatr_check.user_b')::uuid;
  ma uuid := current_setting('operatr_check.msg_a')::uuid;
  mb uuid := current_setting('operatr_check.msg_b')::uuid;
  actor uuid; other_user uuid; own_msg uuid; other_msg uuid; i integer;
begin
  for i in 1..2 loop
    actor := case when i = 1 then a else b end;
    other_user := case when i = 1 then b else a end;
    own_msg := case when i = 1 then ma else mb end;
    other_msg := case when i = 1 then mb else ma end;
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', actor::text, true);
    if auth.uid() is distinct from actor then raise exception 'INCONCLUSIVE: cannot assume test user %', i; end if;
    if (select count(*) from public.chat_value_estimates where message_id = own_msg) <> 1 then
      raise exception 'INCONCLUSIVE: user % cannot read own synthetic estimate', i;
    end if;
    if (select count(*) from public.chat_value_estimates where message_id = other_msg) <> 0 then
      raise exception 'FAIL: user % can read another account estimate', i;
    end if;
    if (select count(*) from public.google_workspace_connections where user_id = actor) <> 1 then
      raise exception 'INCONCLUSIVE: user % cannot read own connection row', i;
    end if;
    if (select count(*) from public.google_workspace_connections where user_id = other_user) <> 0 then
      raise exception 'FAIL: user % can read another account connection row', i;
    end if;
  end loop;
end $$;
reset role;
select 'PASS: both test users can read their own estimate and connection rows, but not each other''s' as result;
rollback;
