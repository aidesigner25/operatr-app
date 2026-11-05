-- Per-user totals and calendar buckets in the viewer's selected IANA time zone.
create or replace function public.value_estimate_summary_local(p_timezone text default 'UTC')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with zone as (
    select coalesce((select name from pg_catalog.pg_timezone_names where name = p_timezone limit 1), 'UTC') as name
  ), bounds as (
    select name, (now() at time zone name)::date as today from zone
  ), estimates as (
    select e.minutes_saved, e.hourly_rate, (e.created_at at time zone b.name)::date as local_day
    from public.chat_value_estimates e cross join bounds b
    where e.user_id = (select auth.uid()) and e.minutes_saved > 0
  ), monthly as (
    select date_trunc('month', local_day::timestamp)::date as month,
      sum(minutes_saved) as minutes, sum(round(minutes_saved * hourly_rate / 60, 2)) as value
    from estimates group by 1
  ), daily as (
    select local_day, sum(minutes_saved) as minutes,
      sum(round(minutes_saved * hourly_rate / 60, 2)) as value
    from estimates group by 1
  ), months as (
    select to_char(m.start, 'YYYY-MM') as month, coalesce(x.minutes, 0) as minutes, coalesce(x.value, 0) as value
    from bounds b cross join lateral generate_series(date_trunc('month', b.today::timestamp) - interval '5 months', date_trunc('month', b.today::timestamp), interval '1 month') m(start)
    left join monthly x on x.month = m.start::date
  ), days as (
    select d.start::date as day, coalesce(x.minutes, 0) as minutes, coalesce(x.value, 0) as value
    from bounds b cross join lateral generate_series(date_trunc('week', b.today::timestamp), date_trunc('week', b.today::timestamp) + interval '6 days', interval '1 day') d(start)
    left join daily x on x.local_day = d.start::date
  )
  select jsonb_build_object(
    'count', (select count(*) from estimates),
    'minutes', (select coalesce(sum(minutes_saved), 0) from estimates),
    'value', (select coalesce(sum(round(minutes_saved * hourly_rate / 60, 2)), 0) from estimates),
    'timezone', (select name from bounds),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', month, 'minutes', minutes, 'value', value) order by month), '[]'::jsonb) from months),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'minutes', minutes, 'value', value) order by day), '[]'::jsonb) from days)
  );
$$;
revoke all on function public.value_estimate_summary_local(text) from public, anon;
grant execute on function public.value_estimate_summary_local(text) to authenticated;
