import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('local lab tests the exact profile migration in a rollback transaction', () => {
 const m=readFileSync(new URL('../supabase/migrations/202611050004_profile_text_bounds.sql',import.meta.url),'utf8');
 const lab=readFileSync(new URL('../supabase/security_checks/profile_bounds_local_lab.sql',import.meta.url),'utf8');
 assert.ok(lab.includes(m));
 assert.match(lab, /operatr-full-recovery-source-v1/);
 assert.match(lab, /rollback;\s*select 'PASS:/i);
 for (const field of ['business_goals','writing_sample','agent_instructions']) assert.match(lab,new RegExp(`oversized ${field === 'business_goals' ? 'business goals' : field === 'writing_sample' ? 'writing sample' : 'directives'} accepted`));
});
