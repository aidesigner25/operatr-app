// Local-only synthetic credential fixture. Never reads production env or keys.
import { randomBytes } from 'node:crypto';
import * as crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';

const container = 'supabase_db_full-recovery-source';
const owner = 'a0000000-0000-4000-8000-000000000001';
const keyId = 'synthetic-recovery-v1';
const keyPath = join(homedir(), 'Documents/Operatr-Backup-Drills/full-recovery-source/synthetic-recovery-key.json');
const psql = (sql) => spawnSync('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','--set','ON_ERROR_STOP=1','-qAt'], { input: sql, encoding: 'utf8', timeout: 30000 });

try {
  const check = psql("select exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') and exists(select 1 from auth.users where id='" + owner + "') and not exists(select 1 from public.vault_credentials) and not exists(select 1 from public.google_workspace_connections);\n");
  if (check.status !== 0 || check.stdout.trim() !== 't') throw new Error('source preflight');
  const secret = randomBytes(32).toString('base64url');
  const env = { OPERATR_KEY_ENCRYPTION_KEY_ID: keyId };
  const modules = {
    'server-only': {},
    'node:crypto': crypto,
    '@/lib/server/env': { assertCredentialVaultConfiguration() {}, getServerEnvironment: () => ({ encryptionSecret: secret }) },
  };
  const source = readFileSync(new URL('../src/lib/server/vault.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: id => { if (!(id in modules)) throw new Error('unexpected module'); return modules[id]; }, process: { env }, Buffer };
  vm.runInNewContext(code, context);
  const vault = context.exports;
  const provider = vault.encryptCredential('synthetic-provider-secret', owner, 'openai');
  const google = vault.encryptCredential('synthetic-google-refresh-token', owner, 'google_workspace');
  if (vault.decryptCredential(provider.ciphertext, owner, 'openai') !== 'synthetic-provider-secret' || vault.decryptCredential(google.ciphertext, owner, 'google_workspace') !== 'synthetic-google-refresh-token') throw new Error('crypto check');
  // Keep this fake key outside both Git and the database backup, so the restore
  // test must supply it separately. Exclusive create prevents overwriting it.
  writeFileSync(keyPath, JSON.stringify({ keyId, secret }) + '\n', { flag: 'wx', mode: 0o600 });
  const sql = `begin;\ndo $$ begin\n if not exists(select 1 from public.operatr_full_recovery_lab_marker where marker='operatr-full-recovery-source-v1') or exists(select 1 from public.vault_credentials) or exists(select 1 from public.google_workspace_connections) then raise exception 'STOP: invalid fixture state'; end if;\nend $$;\ninsert into public.vault_credentials(user_id,provider,encrypted_credential,encryption_version,key_id,last_four) values('${owner}','openai','${provider.ciphertext}',1,'${keyId}','cret');\ninsert into public.google_workspace_connections(user_id,encrypted_refresh_token) values('${owner}','${google.ciphertext}');\ncommit;\n`;
  const result = psql(sql);
  if (result.status !== 0) throw new Error('fixture insert');
  console.log('PASS: synthetic provider and Google credentials encrypted and stored; test key saved separately');
} catch {
  console.error('STOP: synthetic credential setup did not complete. Do not retry or delete the test key; report this message for safe diagnosis.');
  process.exitCode = 1;
}
