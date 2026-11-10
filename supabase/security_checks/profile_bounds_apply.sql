-- Apply only in the actual Operatr project after confirming project identity.
-- Atomic DDL: no data is edited; validation failure aborts the transaction.
begin;
do $$ begin
 if to_regclass('public.profiles') is null then raise exception 'STOP: profiles table missing'; end if;
 if to_regclass('public.operatr_full_recovery_lab_marker') is not null or to_regclass('public.operatr_rotation_lab_marker') is not null then raise exception 'STOP: test project marker detected'; end if;
 if exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname in ('profiles_business_goals_length','profiles_writing_sample_length','profiles_agent_instructions_length')) then raise exception 'STOP: one or more proposed constraint names already exist'; end if;
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
do $$
begin
 if (select count(*) from pg_constraint where conrelid='public.profiles'::regclass and convalidated and conname in ('profiles_business_goals_length','profiles_writing_sample_length','profiles_agent_instructions_length')) <> 3 then
  raise exception 'FAIL: profile constraints not all validated';
 end if;
end $$;
commit;
select 'PASS: three profile text bounds applied and validated' as result;
