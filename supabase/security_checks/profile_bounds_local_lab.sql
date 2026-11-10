-- LOCAL FULL-RECOVERY RESTORE TARGET ONLY. All changes are rolled back.
begin;
do $$ begin
 if to_regclass('public.operatr_full_recovery_lab_marker') is null then raise exception 'STOP: lab marker missing'; end if;
 if not exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') then raise exception 'STOP: wrong target'; end if;
 if exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname in ('profiles_business_goals_length','profiles_writing_sample_length','profiles_agent_instructions_length')) then raise exception 'STOP: constraints already present'; end if;
end $$;
-- BEGIN EXACT MIGRATION
-- Bound owner-writable profile text even when clients bypass Next.js and use
-- the Supabase Data API directly. PostgreSQL char_length counts Unicode code
-- points; Next.js also applies its existing UTF-16-code-unit limits.
-- VALIDATE fails atomically if any pre-existing row exceeds a bound. No data
-- is truncated or otherwise changed. Review and test before deployment.
alter table public.profiles
  add constraint profiles_business_goals_length
    check (business_goals is null or char_length(business_goals) <= 12000) not valid,
  add constraint profiles_writing_sample_length
    check (writing_sample is null or char_length(writing_sample) <= 20000) not valid,
  add constraint profiles_agent_instructions_length
    check (agent_instructions is null or char_length(agent_instructions) <= 12000) not valid;

alter table public.profiles validate constraint profiles_business_goals_length;
alter table public.profiles validate constraint profiles_writing_sample_length;
alter table public.profiles validate constraint profiles_agent_instructions_length;

-- END EXACT MIGRATION
set local role authenticated;
do $$
declare
 owner_id uuid := 'a0000000-0000-4000-8000-000000000001';
 n integer; rejected boolean;
begin
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 update public.profiles set business_goals=repeat('a',12000),writing_sample=repeat('b',20000),agent_instructions=repeat('c',12000) where id=owner_id;
 get diagnostics n = row_count; if n<>1 then raise exception 'FAIL: owner maximum-length update'; end if;
 rejected:=false;
 begin update public.profiles set business_goals=repeat('a',12001) where id=owner_id; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'FAIL: oversized business goals accepted'; end if;
 rejected:=false;
 begin update public.profiles set writing_sample=repeat('b',20001) where id=owner_id; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'FAIL: oversized writing sample accepted'; end if;
 rejected:=false;
 begin update public.profiles set agent_instructions=repeat('c',12001) where id=owner_id; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'FAIL: oversized directives accepted'; end if;
 update public.profiles set business_goals=null,writing_sample=null,agent_instructions=null where id=owner_id;
 get diagnostics n = row_count; if n<>1 then raise exception 'FAIL: nullable values'; end if;
end $$;
reset role;
rollback;
select 'PASS: profile text bounds preserve valid writes and reject oversized direct writes; changes rolled back' as result;
