-- Read-only isolation check. Use ONLY two dedicated test accounts and their
-- own harmless test conversations. Replace the four UUID placeholders below.
-- Run the whole script as one query in Supabase SQL Editor, not in pieces.
-- No real data is written. All role and claim changes are transaction-local.
-- Permission errors are INCONCLUSIVE: investigate grants, do not call them PASS.
-- This checks SELECT for profiles and conversations only. It does not cover
-- mutations, the Data API, every table, or service-role access.
begin;
select set_config('operatr_check.user_a', 'USER_A_UUID', true);
select set_config('operatr_check.user_b', 'USER_B_UUID', true);
select set_config('operatr_check.chat_a', 'CONVERSATION_A_UUID', true);
select set_config('operatr_check.chat_b', 'CONVERSATION_B_UUID', true);

-- Validate identity and positive controls as an administrator before assuming
-- either a zero-row result or a missing test row is an isolation success.
do $$
declare
  a uuid := current_setting('operatr_check.user_a')::uuid;
  b uuid := current_setting('operatr_check.user_b')::uuid;
  ca uuid := current_setting('operatr_check.chat_a')::uuid;
  cb uuid := current_setting('operatr_check.chat_b')::uuid;
begin
  if a = b or ca = cb then raise exception 'INCONCLUSIVE: test users and chats must be distinct'; end if;
  if not exists (select 1 from public.profiles where id = a)
     or not exists (select 1 from public.profiles where id = b)
     or not exists (select 1 from public.chat_conversations where id = ca and user_id = a)
     or not exists (select 1 from public.chat_conversations where id = cb and user_id = b) then
    raise exception 'INCONCLUSIVE: one or more test records missing or owned by the wrong account';
  end if;
end $$;

set local role authenticated;
do $$
declare
  a uuid := current_setting('operatr_check.user_a')::uuid;
  b uuid := current_setting('operatr_check.user_b')::uuid;
  ca uuid := current_setting('operatr_check.chat_a')::uuid;
  cb uuid := current_setting('operatr_check.chat_b')::uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  if auth.uid() is distinct from a then raise exception 'INCONCLUSIVE: could not assume user A'; end if;
  if (select count(*) from public.profiles where id = a) <> 1 or (select count(*) from public.chat_conversations where id = ca) <> 1 then
    raise exception 'INCONCLUSIVE: user A cannot see their own test rows';
  end if;
  if (select count(*) from public.profiles where id = b) <> 0 or (select count(*) from public.chat_conversations where id = cb) <> 0 then
    raise exception 'FAIL: user A can read user B test data';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  if auth.uid() is distinct from b then raise exception 'INCONCLUSIVE: could not assume user B'; end if;
  if (select count(*) from public.profiles where id = b) <> 1 or (select count(*) from public.chat_conversations where id = cb) <> 1 then
    raise exception 'INCONCLUSIVE: user B cannot see their own test rows';
  end if;
  if (select count(*) from public.profiles where id = a) <> 0 or (select count(*) from public.chat_conversations where id = ca) <> 0 then
    raise exception 'FAIL: user B can read user A test data';
  end if;
end $$;
reset role;
select 'PASS: both test users can read their own profiles and chats, but not each other''s' as result;
rollback;
