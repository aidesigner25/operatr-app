import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("disposable SQL lab contains the exact rotation migration and rolls back", () => {
  const migration = readFileSync(new URL("../supabase/migrations/202611050002_credential_rotation_guards.sql", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../supabase/security_checks/rotation_isolated_sql_lab.sql", import.meta.url), "utf8");
  assert.ok(lab.includes(migration));
  assert.match(lab, /STOP: Existing Operatr tables or functions found/);
  assert.match(lab.trimEnd(), /rollback;$/i);
});

test("persistent test-project setup embeds the exact migration and refuses existing app tables", () => {
  const migration = readFileSync(new URL("../supabase/migrations/202611050002_credential_rotation_guards.sql", import.meta.url), "utf8");
  const setup = readFileSync(new URL("../supabase/security_checks/rotation_data_api_lab_setup.sql", import.meta.url), "utf8");
  assert.ok(setup.includes(migration));
  assert.match(setup, /STOP: Existing Operatr tables or functions found/);
  assert.match(setup, /commit;\s*select 'PASS: disposable rotation Data API lab initialized'/i);
});
