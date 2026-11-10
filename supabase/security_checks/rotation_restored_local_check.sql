-- LOCAL RESTORE LAB ONLY. Execute through docker exec against
-- supabase_db_restore-target. All synthetic rows are rolled back.
begin;
do $$
declare f text; t text; r text; p text;
begin
 if not exists(select 1 from public.operatr_rotation_lab_marker where marker='operatr-rotation-lab-only-v1') then raise exception 'STOP: lab marker missing'; end if;
 foreach f in array array['public.operatr_rotation_role_check()','public.operatr_rotate_vault_credential(uuid,uuid,text,timestamptz,text,text,smallint,text,text,smallint)','public.operatr_rotate_google_connection(uuid,timestamptz,text,text)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'FAIL: function privilege: %',f; end if;
 end loop;
 foreach t in array array['public.vault_credentials','public.google_workspace_connections','public.operatr_rotation_lab_marker'] loop
  if not (select relrowsecurity from pg_catalog.pg_class where oid=to_regclass(t)) then raise exception 'FAIL: RLS disabled on %',t; end if;
  foreach r in array array['anon','authenticated'] loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege(r,t,p) then raise exception 'FAIL: unexpected % % on %',r,p,t; end if;
   end loop;
  end loop;
 end loop;
end $$;
set local role service_role;
do $$
declare
 v_id uuid := gen_random_uuid(); u_id uuid := gen_random_uuid();
 stamp timestamptz := '2026-01-01 00:00:00+00';
begin
 if public.operatr_rotation_role_check() is distinct from true then raise exception 'FAIL: maintenance identity'; end if;
 insert into public.vault_credentials(id,user_id,provider,encrypted_credential,key_id,encryption_version,last_four,created_at,updated_at)
 values(v_id,u_id,'openai','v1.old.synthetic','old',1,'test',stamp,stamp);
 insert into public.google_workspace_connections(user_id,encrypted_refresh_token,created_at,updated_at)
 values(u_id,'v1.old.google',stamp,stamp);
 if public.operatr_rotate_vault_credential(v_id,u_id,'openai',stamp,'v1.stale','old',1::smallint,'v1.new.synthetic','new',1::smallint) then raise exception 'FAIL: stale vault accepted'; end if;
 if public.operatr_rotate_google_connection(u_id,stamp,'v1.stale','v1.new.google') then raise exception 'FAIL: stale Google accepted'; end if;
 if not public.operatr_rotate_vault_credential(v_id,u_id,'openai',stamp,'v1.old.synthetic','old',1::smallint,'v1.new.synthetic','new',1::smallint) then raise exception 'FAIL: vault update'; end if;
 if not public.operatr_rotate_google_connection(u_id,stamp,'v1.old.google','v1.new.google') then raise exception 'FAIL: Google update'; end if;
 if not exists(select 1 from public.vault_credentials where id=v_id and encrypted_credential='v1.new.synthetic' and key_id='new') then raise exception 'FAIL: vault verification'; end if;
 if not exists(select 1 from public.google_workspace_connections where user_id=u_id and encrypted_refresh_token='v1.new.google') then raise exception 'FAIL: Google verification'; end if;
 if public.operatr_rotate_vault_credential(v_id,u_id,'openai',stamp,'v1.old.synthetic','old',1::smallint,'v1.new.synthetic','new',1::smallint) then raise exception 'FAIL: stale vault retry'; end if;
 if public.operatr_rotate_google_connection(u_id,stamp,'v1.old.google','v1.new.google') then raise exception 'FAIL: stale Google retry'; end if;
end $$;
reset role;
rollback;
select 'PASS: restored lab permissions, guarded rotation, stale rejection, and rollback' as result;
