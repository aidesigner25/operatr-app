-- LOCAL SYNTHETIC FULL-RECOVERY TARGET ONLY. All fixtures are rolled back.
begin;
do $$
begin
 if to_regclass('public.operatr_full_recovery_lab_marker') is null then raise exception 'STOP: marker missing'; end if;
 if not exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') then raise exception 'STOP: wrong target'; end if;
 if exists(select 1 from auth.users where id='a0000000-0000-4000-8000-000000000003') then raise exception 'STOP: test account already exists'; end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
values ('a0000000-0000-4000-8000-000000000003','isolation-test@example.invalid','{"display_name":"Isolation Test"}',now(),now());
set local role authenticated;
do $$
declare
 a uuid := 'a0000000-0000-4000-8000-000000000001';
 b uuid := 'a0000000-0000-4000-8000-000000000003';
 c_a uuid := 'd0000000-0000-4000-8000-000000000001';
 c_b uuid := 'd0000000-0000-4000-8000-000000000003';
 m_a uuid := 'e0000000-0000-4000-8000-000000000001';
 m_b uuid := 'e0000000-0000-4000-8000-000000000003';
 r_a uuid := 'f0000000-0000-4000-8000-000000000001';
 r_b uuid := 'f0000000-0000-4000-8000-000000000003';
 owner_id uuid; other_id uuid; conv uuid; other_conv uuid; msg uuid; v_run_id uuid;
 n integer; blocked boolean; i integer;
begin
 for i in 1..2 loop
  owner_id := case when i=1 then a else b end;
  conv := case when i=1 then c_a else c_b end;
  msg := case when i=1 then m_a else m_b end;
  v_run_id := case when i=1 then r_a else r_b end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  if auth.uid() is distinct from owner_id then raise exception 'INCONCLUSIVE: identity'; end if;
  if not exists(select 1 from public.profiles where id=owner_id) then raise exception 'FAIL: own profile'; end if;
  insert into public.chat_conversations(id,user_id,title,provider,model) values(conv,owner_id,'Recovery isolation test','openai','synthetic-model');
  insert into public.chat_messages(id,conversation_id,user_id,role,content,status) values(msg,conv,owner_id,'assistant','Synthetic isolation test','completed');
  insert into public.chat_agent_runs(id,conversation_id,user_id,provider,model,response_style,status,max_output_tokens) values(v_run_id,conv,owner_id,'openai','synthetic-model','medium','completed',100);
  insert into public.chat_agent_run_events(run_id,user_id,stage,detail) values(v_run_id,owner_id,'completed','Synthetic event');
  insert into public.chat_value_estimates(message_id,conversation_id,user_id,minutes_saved,hourly_rate,source) values(msg,conv,owner_id,30,100,'user');
  update public.chat_conversations set title='Own update' where id=conv;
  get diagnostics n = row_count; if n<>1 then raise exception 'FAIL: own update'; end if;
  if not exists(select 1 from public.chat_messages where id=msg) or not exists(select 1 from public.chat_agent_runs where id=v_run_id) or not exists(select 1 from public.chat_agent_run_events where chat_agent_run_events.run_id=v_run_id) or not exists(select 1 from public.chat_value_estimates where message_id=msg) then raise exception 'FAIL: own record visibility'; end if;
 end loop;
 for i in 1..2 loop
  owner_id := case when i=1 then a else b end;
  other_id := case when i=1 then b else a end;
  other_conv := case when i=1 then c_b else c_a end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  if exists(select 1 from public.profiles where id=other_id) or exists(select 1 from public.chat_conversations where user_id=other_id) or exists(select 1 from public.chat_messages where user_id=other_id) or exists(select 1 from public.chat_agent_runs where user_id=other_id) or exists(select 1 from public.chat_agent_run_events where user_id=other_id) or exists(select 1 from public.chat_value_estimates where user_id=other_id) or exists(select 1 from public.vault_credentials where user_id=other_id) or exists(select 1 from public.google_workspace_connections where user_id=other_id) then raise exception 'FAIL: cross-account read'; end if;
  update public.chat_conversations set title='Forbidden' where id=other_conv;
  get diagnostics n = row_count; if n<>0 then raise exception 'FAIL: cross-account update'; end if;
  delete from public.chat_conversations where id=other_conv;
  get diagnostics n = row_count; if n<>0 then raise exception 'FAIL: cross-account delete'; end if;
  blocked:=false;
  begin
   insert into public.chat_conversations(user_id,title,provider,model) values(other_id,'Forbidden','openai','synthetic-model');
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'FAIL: cross-account insert'; end if;
 end loop;
end $$;
reset role;
rollback;
select 'PASS: restored RLS enforces two-account isolation for tested synthetic workflows; fixtures rolled back' as result;
