import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('the guarded rollback lab exercises the exact current security event migration', () => {
  const migration=readFileSync(new URL('../supabase/security_checks/vault_security_events_candidate.sql',import.meta.url),'utf8');
  const lab=readFileSync(new URL('../supabase/security_checks/vault_security_events_candidate_lab.sql',import.meta.url),'utf8');
  assert.ok(lab.includes(migration));
  assert.match(lab,/operatr-full-recovery-source-v1/);
  assert.match(lab,/rollback;\s*select 'PASS:/i);
});
