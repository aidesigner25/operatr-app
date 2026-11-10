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
