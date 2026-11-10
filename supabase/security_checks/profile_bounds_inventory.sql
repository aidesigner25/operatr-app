-- READ ONLY: aggregate counts only; does not display profile content or IDs.
-- Run in the actual Operatr project. A nonzero count needs review before
-- adding constraints. JavaScript counts UTF-16 code units; PostgreSQL
-- char_length counts characters, so the limits are not fully equivalent.
select
  count(*) filter (where char_length(business_goals) > 12000) as business_goals_over_limit,
  count(*) filter (where char_length(writing_sample) > 20000) as writing_sample_over_limit,
  count(*) filter (where char_length(agent_instructions) > 12000) as agent_instructions_over_limit
from public.profiles;
