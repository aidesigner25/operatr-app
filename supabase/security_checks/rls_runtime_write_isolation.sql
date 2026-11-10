-- Run the ENTIRE script in one SQL Editor query, replacing only the two UUIDs.
-- Synthetic conversations/messages/runs/events/estimates are rolled back.
-- No existing profile, credential, connection, conversation or message is changed.
-- Errors are inconclusive unless explicitly marked FAIL. Use test accounts only.
begin;
select set_config('operatr_check.user_a','USER_A_UUID',true);
select set_config('operatr_check.user_b','USER_B_UUID',true);
select set_config('operatr_check.chat_a',gen_random_uuid()::text,true);
select set_config('operatr_check.chat_b',gen_random_uuid()::text,true);
select set_config('operatr_check.msg_a',gen_random_uuid()::text,true);
select set_config('operatr_check.msg_b',gen_random_uuid()::text,true);
select set_config('operatr_check.run_a',gen_random_uuid()::text,true);
select set_config('operatr_check.run_b',gen_random_uuid()::text,true);
select set_config('operatr_check.event_a',gen_random_uuid()::text,true);
select set_config('operatr_check.event_b',gen_random_uuid()::text,true);
do $$
declare a uuid := current_setting('operatr_check.user_a')::uuid; b uuid := current_setting('operatr_check.user_b')::uuid;
begin
 if a=b then raise exception 'INCONCLUSIVE: test accounts must differ'; end if;
 if not exists(select 1 from public.profiles where id=a) or not exists(select 1 from public.profiles where id=b) then raise exception 'INCONCLUSIVE: test profiles missing'; end if;
end $$;
insert into public.chat_conversations(id,user_id,title,provider,model,response_style)
values (current_setting('operatr_check.chat_a')::uuid,current_setting('operatr_check.user_a')::uuid,'RLS fixture A','openai','test-model','medium'),
(current_setting('operatr_check.chat_b')::uuid,current_setting('operatr_check.user_b')::uuid,'RLS fixture B','openai','test-model','medium');
insert into public.chat_messages(id,conversation_id,user_id,role,content,status)
values (current_setting('operatr_check.msg_a')::uuid,current_setting('operatr_check.chat_a')::uuid,current_setting('operatr_check.user_a')::uuid,'assistant','RLS fixture A','completed'),
(current_setting('operatr_check.msg_b')::uuid,current_setting('operatr_check.chat_b')::uuid,current_setting('operatr_check.user_b')::uuid,'assistant','RLS fixture B','completed');
insert into public.chat_agent_runs(id,conversation_id,user_id,provider,model,response_style,status,max_output_tokens)
values (current_setting('operatr_check.run_a')::uuid,current_setting('operatr_check.chat_a')::uuid,current_setting('operatr_check.user_a')::uuid,'openai','test-model','medium','completed',100),
(current_setting('operatr_check.run_b')::uuid,current_setting('operatr_check.chat_b')::uuid,current_setting('operatr_check.user_b')::uuid,'openai','test-model','medium','completed',100);
insert into public.chat_agent_run_events(id,run_id,user_id,stage,detail)
values (current_setting('operatr_check.event_a')::uuid,current_setting('operatr_check.run_a')::uuid,current_setting('operatr_check.user_a')::uuid,'completed','RLS fixture'),
(current_setting('operatr_check.event_b')::uuid,current_setting('operatr_check.run_b')::uuid,current_setting('operatr_check.user_b')::uuid,'completed','RLS fixture');
insert into public.chat_value_estimates(message_id,conversation_id,user_id,minutes_saved,hourly_rate,source)
values (current_setting('operatr_check.msg_a')::uuid,current_setting('operatr_check.chat_a')::uuid,current_setting('operatr_check.user_a')::uuid,30,100,'user'),
(current_setting('operatr_check.msg_b')::uuid,current_setting('operatr_check.chat_b')::uuid,current_setting('operatr_check.user_b')::uuid,30,100,'user');
set local role authenticated;
do $$
declare
 a uuid:=current_setting('operatr_check.user_a')::uuid; b uuid:=current_setting('operatr_check.user_b')::uuid;
 actor uuid; own_chat uuid; other_chat uuid; own_run uuid; other_run uuid; own_event uuid; other_event uuid; own_msg uuid; other_msg uuid;
 sr uuid; se uuid; sm uuid; n integer; i integer; denied boolean;
begin
 for i in 1..2 loop
  actor:=case when i=1 then a else b end;
  own_chat:=current_setting(case when i=1 then 'operatr_check.chat_a' else 'operatr_check.chat_b' end)::uuid;
  other_chat:=current_setting(case when i=1 then 'operatr_check.chat_b' else 'operatr_check.chat_a' end)::uuid;
  own_run:=current_setting(case when i=1 then 'operatr_check.run_a' else 'operatr_check.run_b' end)::uuid;
  other_run:=current_setting(case when i=1 then 'operatr_check.run_b' else 'operatr_check.run_a' end)::uuid;
  own_event:=current_setting(case when i=1 then 'operatr_check.event_a' else 'operatr_check.event_b' end)::uuid;
  other_event:=current_setting(case when i=1 then 'operatr_check.event_b' else 'operatr_check.event_a' end)::uuid;
  own_msg:=current_setting(case when i=1 then 'operatr_check.msg_a' else 'operatr_check.msg_b' end)::uuid;
  other_msg:=current_setting(case when i=1 then 'operatr_check.msg_b' else 'operatr_check.msg_a' end)::uuid;
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if auth.uid() is distinct from actor then raise exception 'INCONCLUSIVE: could not assume user %',i; end if;
  -- Verify the owner can update each synthetic row before cross-user attempts.
  update public.chat_agent_runs set output_characters=1 where id=own_run; get diagnostics n=row_count; if n<>1 then raise exception 'INCONCLUSIVE: own run update user %',i; end if;
  update public.chat_agent_run_events set detail='RLS own update' where id=own_event; get diagnostics n=row_count; if n<>1 then raise exception 'INCONCLUSIVE: own event update user %',i; end if;
  update public.chat_value_estimates set minutes_saved=31 where message_id=own_msg; get diagnostics n=row_count; if n<>1 then raise exception 'INCONCLUSIVE: own estimate update user %',i; end if;
  update public.chat_agent_runs set output_characters=2 where id=other_run; get diagnostics n=row_count; if n<>0 then raise exception 'FAIL: cross-user run update user %',i; end if;
  update public.chat_agent_run_events set detail='RLS forbidden' where id=other_event; get diagnostics n=row_count; if n<>0 then raise exception 'FAIL: cross-user event update user %',i; end if;
  update public.chat_value_estimates set minutes_saved=32 where message_id=other_msg; get diagnostics n=row_count; if n<>0 then raise exception 'FAIL: cross-user estimate update user %',i; end if;
  delete from public.chat_agent_run_events where id=other_event; get diagnostics n=row_count; if n<>0 then raise exception 'FAIL: cross-user event delete user %',i; end if;
  delete from public.chat_value_estimates where message_id=other_msg; get diagnostics n=row_count; if n<>0 then raise exception 'FAIL: cross-user estimate delete user %',i; end if;
  delete from public.chat_agent_runs where id=other_run; get diagnostics n=row_count; if n<>0 then raise exception 'FAIL: cross-user run delete user %',i; end if;
  -- Own inserts and deletes establish the relevant grants and policies work.
  sr:=gen_random_uuid(); se:=gen_random_uuid(); sm:=gen_random_uuid();
  insert into public.chat_agent_runs(id,conversation_id,user_id,provider,model,response_style,status,max_output_tokens) values(sr,own_chat,actor,'openai','test-model','medium','completed',100);
  insert into public.chat_agent_run_events(id,run_id,user_id,stage,detail) values(se,sr,actor,'completed','RLS own insert');
  insert into public.chat_messages(id,conversation_id,user_id,role,content,status) values(sm,own_chat,actor,'assistant','RLS own estimate','completed');
  insert into public.chat_value_estimates(message_id,conversation_id,user_id,minutes_saved,hourly_rate,source) values(sm,own_chat,actor,30,100,'user');
  delete from public.chat_agent_run_events where id=se; get diagnostics n=row_count; if n<>1 then raise exception 'INCONCLUSIVE: own event delete user %',i; end if;
  delete from public.chat_value_estimates where message_id=sm; get diagnostics n=row_count; if n<>1 then raise exception 'INCONCLUSIVE: own estimate delete user %',i; end if;
  delete from public.chat_agent_runs where id=sr; get diagnostics n=row_count; if n<>1 then raise exception 'INCONCLUSIVE: own run delete user %',i; end if;
  delete from public.chat_messages where id=sm; get diagnostics n=row_count; if n<>1 then raise exception 'INCONCLUSIVE: own message delete user %',i; end if;
  denied:=false;
  begin insert into public.chat_agent_runs(id,conversation_id,user_id,provider,model,response_style,status,max_output_tokens) values(gen_random_uuid(),other_chat,actor,'openai','test-model','medium','completed',100); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: cross-parent run insert user %',i; end if;
  denied:=false;
  begin insert into public.chat_agent_run_events(id,run_id,user_id,stage,detail) values(gen_random_uuid(),other_run,actor,'completed','RLS forbidden'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: cross-parent event insert user %',i; end if;
  -- A fresh assistant message belonging to the other account is not available
  -- without collision; test a mismatched conversation on an owned new message.
  sm:=gen_random_uuid();
  insert into public.chat_messages(id,conversation_id,user_id,role,content,status) values(sm,own_chat,actor,'assistant','RLS mismatch fixture','completed');
  denied:=false;
  begin insert into public.chat_value_estimates(message_id,conversation_id,user_id,minutes_saved,hourly_rate,source) values(sm,other_chat,actor,30,100,'user'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: cross-parent estimate insert user %',i; end if;
  delete from public.chat_messages where id=sm;
 end loop;
end $$;
reset role;
select 'PASS: both accounts passed synthetic run, event and estimate write checks' as result;
rollback;
