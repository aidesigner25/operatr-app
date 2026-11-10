// Read-only synthetic local recovery inspection. Never reads real .env or keys.
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';

const user = 'a0000000-0000-4000-8000-000000000001';
const keyPath = join(homedir(), 'Documents/Operatr-Backup-Drills/full-recovery-source/synthetic-recovery-key.json');
const sql = `
with tables(name) as (values ('profiles'),('vault_credentials'),('vault_audit_events'),('chat_conversations'),('chat_messages'),('chat_agent_runs'),('chat_agent_run_events'),('google_workspace_connections'),('chat_value_estimates')),
privs(name) as (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')),
funcs(sig) as (values ('public.operatr_rotation_role_check()'),('public.operatr_rotate_vault_credential(uuid,uuid,text,timestamptz,text,text,smallint,text,text,smallint)'),('public.operatr_rotate_google_connection(uuid,timestamptz,text,text)')),
summary_funcs(sig) as (values ('public.value_estimate_summary()'),('public.value_estimate_summary_local(text)'))
select json_build_object(
 'marker', exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1'),
 'account_data', exists(select 1 from auth.users where id='${user}' and email='recovery-lab@example.invalid') and exists(select 1 from public.profiles where id='${user}' and display_name='Recovery Lab') and exists(select 1 from public.chat_conversations where id='b0000000-0000-4000-8000-000000000001' and user_id='${user}') and exists(select 1 from public.chat_messages where id='c0000000-0000-4000-8000-000000000001' and content='Synthetic recovery fixture') and exists(select 1 from public.chat_value_estimates where message_id='c0000000-0000-4000-8000-000000000001' and minutes_saved=60),
 'trigger', exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace where t.tgrelid='auth.users'::regclass and t.tgname='on_auth_user_created' and not t.tgisinternal and t.tgenabled='O' and n.nspname='public' and p.proname='handle_new_auth_user'),
 'rls', (select bool_and(coalesce(c.relrowsecurity,false)) from tables x left join pg_class c on c.oid=to_regclass(format('public.%I',x.name))),
 'anon_table_grants', not exists(select 1 from tables x cross join privs p where has_table_privilege('anon',to_regclass(format('public.%I',x.name)),p.name)),
 'authenticated_table_grants', not exists(select 1 from tables x cross join privs p where case when p.name in ('SELECT','INSERT') or (p.name in ('UPDATE','DELETE') and x.name <> 'vault_audit_events') then not has_table_privilege('authenticated',to_regclass(format('public.%I',x.name)),p.name) else has_table_privilege('authenticated',to_regclass(format('public.%I',x.name)),p.name) end),
 'rotation_grants', not exists(select 1 from funcs f where to_regprocedure(f.sig) is null or has_function_privilege('anon',to_regprocedure(f.sig),'EXECUTE') or has_function_privilege('authenticated',to_regprocedure(f.sig),'EXECUTE') or not has_function_privilege('service_role',to_regprocedure(f.sig),'EXECUTE')),
 'summary_grants', not exists(select 1 from summary_funcs f where to_regprocedure(f.sig) is null or has_function_privilege('anon',to_regprocedure(f.sig),'EXECUTE') or not has_function_privilege('authenticated',to_regprocedure(f.sig),'EXECUTE')),
 'provider', (select encrypted_credential from public.vault_credentials where user_id='${user}' and provider='openai'),
 'google', (select encrypted_refresh_token from public.google_workspace_connections where user_id='${user}')
)::text;
`;
const checks = [ ['marker','synthetic lab marker'], ['account_data','Auth user, profile, conversation, message, and estimate'], ['trigger','Auth profile trigger'], ['rls','RLS enabled on all nine user tables'], ['anon_table_grants','anonymous table grants'], ['authenticated_table_grants','authenticated table grants'], ['rotation_grants','rotation function grants'], ['summary_grants','summary function grants'] ];
try {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  if (key.keyId !== 'synthetic-recovery-v1' || typeof key.secret !== 'string' || Buffer.from(key.secret,'base64url').length !== 32) throw new Error('invalid synthetic key');
  const result = spawnSync('docker', ['exec','-i','supabase_db_full-recovery-target','psql','-X','-U','postgres','-d','postgres','--set','ON_ERROR_STOP=1','-qAt'], { input: sql, encoding:'utf8', timeout:30000 });
  if (result.status !== 0) throw new Error('database query');
  const data = JSON.parse(result.stdout.trim());
  const env = { OPERATR_KEY_ENCRYPTION_KEY_ID: key.keyId };
  const modules = { 'server-only': {}, 'node:crypto': crypto, '@/lib/server/env': { assertCredentialVaultConfiguration() {}, getServerEnvironment: () => ({ encryptionSecret: key.secret }) } };
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/server/vault.ts', import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports:{}, require:id => { if (!(id in modules)) throw new Error('module'); return modules[id]; }, process:{env}, Buffer };
  vm.runInNewContext(code, context);
  let decryptOk = false;
  try { decryptOk = context.exports.decryptCredential(data.provider,user,'openai') === 'synthetic-provider-secret' && context.exports.decryptCredential(data.google,user,'google_workspace') === 'synthetic-google-refresh-token'; } catch {}
  let failures = 0;
  for (const [field,label] of checks) { const passed = data[field] === true; if(!passed) failures++; console.log(`${passed ? 'PASS' : 'FAIL'}: ${label}`); }
  if(!decryptOk) failures++;
  console.log(`${decryptOk ? 'PASS' : 'FAIL'}: both synthetic credentials decrypt using the separate test key`);
  if(failures) process.exitCode=1;
} catch {
  console.error('INCONCLUSIVE: local recovery inspection failed; no secrets or database output were displayed.');
  process.exitCode=1;
}
