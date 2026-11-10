-- READ ONLY: run in the disposable rotation project and the restored local lab.
-- Includes only named synthetic lab objects and postgres/public defaults.
with wanted_tables(name) as (values ('vault_credentials'),('google_workspace_connections'),('operatr_rotation_lab_marker')),
roles(name) as (values ('anon'),('authenticated'),('service_role')),
privileges(name) as (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')),
table_rows as (
 select 'table' as kind, t.name as object, r.name as role,
   to_regclass(format('public.%I',t.name)) is not null as object_exists,
   coalesce(jsonb_agg(p.name order by p.name) filter (where to_regclass(format('public.%I',t.name)) is not null and has_table_privilege(r.name, to_regclass(format('public.%I',t.name)), p.name)), '[]'::jsonb) as grants
 from wanted_tables t cross join roles r cross join privileges p group by t.name,r.name
), wanted_functions(name,signature) as (values
 ('role_check','public.operatr_rotation_role_check()'),
 ('vault_rotation','public.operatr_rotate_vault_credential(uuid,uuid,text,timestamptz,text,text,smallint,text,text,smallint)'),
 ('google_rotation','public.operatr_rotate_google_connection(uuid,timestamptz,text,text)')
), function_rows as (
 select 'function' as kind, f.name as object, r.name as role,
   to_regprocedure(f.signature) is not null as object_exists,
   case when to_regprocedure(f.signature) is null then '[]'::jsonb
        when has_function_privilege(r.name,to_regprocedure(f.signature),'EXECUTE') then '["EXECUTE"]'::jsonb
        else '[]'::jsonb end as grants
 from wanted_functions f cross join roles r
), defaults as (
 select 'default' as kind,
   case d.defaclobjtype when 'r' then 'tables' when 'f' then 'functions' when 'S' then 'sequences' else d.defaclobjtype::text end as object,
   case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as role,
   true as object_exists,
   jsonb_agg(a.privilege_type order by a.privilege_type) as grants
 from pg_catalog.pg_default_acl d
 join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
 cross join lateral aclexplode(d.defaclacl) a
 where n.nspname='public' and pg_get_userbyid(d.defaclrole)='postgres'
   and d.defaclobjtype in ('r','f','S')
   and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role'))
 group by d.defaclobjtype,a.grantee
)
select * from table_rows union all select * from function_rows union all select * from defaults
order by kind,object,role;
