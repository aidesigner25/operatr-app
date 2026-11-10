-- Extended isolation test: replace ONLY the two placeholders below with the
-- UUIDs of the two dedicated test accounts, then run the entire script at once.
-- Synthetic chat data is inserted inside a transaction and always rolled back.
-- No existing conversation, credential, integration or profile is modified.
-- A SQL error is INCONCLUSIVE, not a pass. Report only the sanitized error.
-- SELECT checks cover all nine listed tables when test-account records exist.
-- Mutation checks cover conversations and messages only, using synthetic rows.
-- This tests Postgres role simulation, not HTTP/Data API or service-role access.

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

-- Fixtures are random IDs created only for this transaction, not existing rows.
insert into public.chat_conversations (id, user_id, title, provider, model, response_style)
values (current_setting('operatr_check.chat_a')::uuid, current_setting('operatr_check.user_a')::uuid, 'RLS synthetic A', 'openai', 'test-model', 'medium'),
       (current_setting('operatr_check.chat_b')::uuid, current_setting('operatr_check.user_b')::uuid, 'RLS synthetic B', 'openai', 'test-model', 'medium');
insert into public.chat_messages (id, conversation_id, user_id, role, content, status)
values (current_setting('operatr_check.msg_a')::uuid, current_setting('operatr_check.chat_a')::uuid, current_setting('operatr_check.user_a')::uuid, 'assistant', 'RLS synthetic A', 'completed'),
       (current_setting('operatr_check.msg_b')::uuid, current_setting('operatr_check.chat_b')::uuid, current_setting('operatr_check.user_b')::uuid, 'assistant', 'RLS synthetic B', 'completed');

create temporary table operatr_check_expected (table_name text, owner_a bigint, owner_b bigint) on commit drop;
create temporary table operatr_check_results (test_name text, outcome text) on commit drop;
grant select on operatr_check_expected to authenticated, anon;
grant select, insert on operatr_check_results to authenticated, anon;

do $$
declare item record; a bigint; b bigint;
begin
  for item in select * from (values
    ('profiles', 'id'), ('vault_credentials', 'user_id'), ('vault_audit_events', 'user_id'),
    ('chat_conversations', 'user_id'), ('chat_messages', 'user_id'), ('chat_agent_runs', 'user_id'),
    ('chat_agent_run_events', 'user_id'), ('google_workspace_connections', 'user_id'), ('chat_value_estimates', 'user_id')
  ) as x(table_name, owner_column) loop
    execute format('select count(*) from public.%I where %I = $1', item.table_name, item.owner_column) into a using current_setting('operatr_check.user_a')::uuid;
    execute format('select count(*) from public.%I where %I = $1', item.table_name, item.owner_column) into b using current_setting('operatr_check.user_b')::uuid;
    insert into operatr_check_expected values (item.table_name, a, b);
  end loop;
end $$;

set local role authenticated;
do $$
declare
  a uuid := current_setting('operatr_check.user_a')::uuid;
  b uuid := current_setting('operatr_check.user_b')::uuid;
  ca uuid := current_setting('operatr_check.chat_a')::uuid;
  cb uuid := current_setting('operatr_check.chat_b')::uuid;
  ma uuid := current_setting('operatr_check.msg_a')::uuid;
  mb uuid := current_setting('operatr_check.msg_b')::uuid;
  actor uuid; other_user uuid; own_chat uuid; other_chat uuid; own_msg uuid; other_msg uuid;
  item record; own_count bigint; other_count bigint; expected bigint; target_expected bigint; changed integer; scratch uuid;
  denied boolean; i integer;
begin
  for i in 1..2 loop
    actor := case when i = 1 then a else b end; other_user := case when i = 1 then b else a end;
    own_chat := case when i = 1 then ca else cb end; other_chat := case when i = 1 then cb else ca end;
    own_msg := case when i = 1 then ma else mb end; other_msg := case when i = 1 then mb else ma end;
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', actor::text, true);
    if auth.uid() is distinct from actor then raise exception 'INCONCLUSIVE: could not assume test user %', i; end if;

    for item in select e.*, case when e.table_name = 'profiles' then 'id' else 'user_id' end as owner_column from operatr_check_expected e loop
      expected := case when i = 1 then item.owner_a else item.owner_b end;
      target_expected := case when i = 1 then item.owner_b else item.owner_a end;
      execute format('select count(*) from public.%I where %I = $1', item.table_name, item.owner_column) into own_count using actor;
      execute format('select count(*) from public.%I where %I = $1', item.table_name, item.owner_column) into other_count using other_user;
      if own_count <> expected then raise exception 'INCONCLUSIVE: user % own-row control failed on %', i, item.table_name; end if;
      if other_count <> 0 then raise exception 'FAIL: user % read another account in %', i, item.table_name; end if;
      insert into operatr_check_results values (format('user %s SELECT %s', i, item.table_name),
        case when expected = 0 then 'SKIP: no own rows for positive control'
             when target_expected = 0 then 'SKIP: other account has no target rows' else 'PASS' end);
    end loop;

    -- Positive controls prove this role can update its own synthetic rows.
    update public.chat_conversations set title = 'RLS own update' where id = own_chat;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'INCONCLUSIVE: user % own conversation update blocked', i; end if;
    update public.chat_messages set content = 'RLS own update' where id = own_msg;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'INCONCLUSIVE: user % own message update blocked', i; end if;

    update public.chat_conversations set title = 'RLS forbidden update' where id = other_chat;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'FAIL: user % updated another account conversation', i; end if;
    update public.chat_messages set content = 'RLS forbidden update' where id = other_msg;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'FAIL: user % updated another account message', i; end if;
    delete from public.chat_messages where id = other_msg;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'FAIL: user % deleted another account message', i; end if;
    delete from public.chat_conversations where id = other_chat;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'FAIL: user % deleted another account conversation', i; end if;

    -- Positive INSERT/DELETE controls use a further random, disposable chat.
    scratch := gen_random_uuid();
    insert into public.chat_conversations (id, user_id, title, provider, model, response_style)
      values (scratch, actor, 'RLS own insert', 'openai', 'test-model', 'medium');
    insert into public.chat_messages (id, conversation_id, user_id, role, content, status)
      values (gen_random_uuid(), scratch, actor, 'user', 'RLS own insert', 'completed');
    delete from public.chat_messages where conversation_id = scratch;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'INCONCLUSIVE: user % own message delete blocked', i; end if;
    delete from public.chat_conversations where id = scratch;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'INCONCLUSIVE: user % own conversation delete blocked', i; end if;

    -- Only permission/RLS errors count as blocking; all other errors surface.
    denied := false;
    begin
      insert into public.chat_conversations (id, user_id, title, provider, model, response_style)
        values (gen_random_uuid(), other_user, 'RLS forbidden insert', 'openai', 'test-model', 'medium');
    exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'FAIL: user % inserted another owner conversation', i; end if;
    denied := false;
    begin
      insert into public.chat_messages (id, conversation_id, user_id, role, content, status)
        values (gen_random_uuid(), other_chat, actor, 'user', 'RLS forbidden insert', 'completed');
    exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'FAIL: user % inserted message into another account conversation', i; end if;
    insert into operatr_check_results values (format('user %s synthetic conversation/message INSERT UPDATE DELETE', i), 'PASS');
  end loop;
end $$;
reset role;

-- Anonymous SELECT may be refused by GRANT before RLS. Both behaviors protect
-- these rows; report them separately so a grant denial is not called RLS proof.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
declare item record; found_rows bigint;
begin
  if auth.uid() is not null then raise exception 'INCONCLUSIVE: anonymous identity not cleared'; end if;
  for item in select t.*, e.owner_a, e.owner_b from (values
    ('profiles','id'), ('vault_credentials','user_id'), ('vault_audit_events','user_id'),
    ('chat_conversations','user_id'), ('chat_messages','user_id'), ('chat_agent_runs','user_id'),
    ('chat_agent_run_events','user_id'), ('google_workspace_connections','user_id'), ('chat_value_estimates','user_id')
  ) as t(table_name, owner_column) join operatr_check_expected e on e.table_name = t.table_name loop
    begin
      execute format('select count(*) from public.%I where %I in ($1, $2)', item.table_name, item.owner_column)
        into found_rows using current_setting('operatr_check.user_a')::uuid, current_setting('operatr_check.user_b')::uuid;
      if found_rows <> 0 then raise exception 'FAIL: anonymous user read test-account rows in %', item.table_name; end if;
      insert into operatr_check_results values (format('anonymous SELECT %s', item.table_name),
        case when item.owner_a + item.owner_b = 0 then 'SKIP: test accounts have no target rows'
             else 'PASS: no test-account rows visible' end);
    exception when insufficient_privilege then
      insert into operatr_check_results values (format('anonymous SELECT %s', item.table_name), 'PASS: blocked by grant');
    end;
  end loop;
end $$;
reset role;
select test_name, outcome from operatr_check_results order by test_name;
rollback;
