import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("disposable grant lab runs the reviewed candidate inside a rollback transaction", () => {
  const candidate = readFileSync(new URL("../supabase/security_checks/grants_hardening_candidate.sql", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../supabase/security_checks/grants_hardening_isolated_lab.sql", import.meta.url), "utf8");
  assert.ok(lab.includes(candidate));
  assert.match(lab, /STOP: use the disposable rotation project/);
  assert.match(lab.trimEnd(), /rollback;$/i);
  assert.doesNotMatch(candidate, /revoke[^;]+from\s+service_role/i);
});


test("grant migration contains the same reviewed and tested candidate", () => {
  const candidate = readFileSync(new URL("../supabase/security_checks/grants_hardening_candidate.sql", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/202611050003_user_table_grant_hardening.sql", import.meta.url), "utf8");
  assert.ok(migration.endsWith(candidate));
});
