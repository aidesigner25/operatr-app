import assert from "node:assert/strict";
import { test } from "node:test";
import { runIsolatedRotationTest } from "../scripts/rotation-isolated-e2e.mjs";

function backend({ brokenConflict = false, helperUnavailable = false, brokenRace = false } = {}) {
  const tables = { vault_credentials: new Map(), google_workspace_connections: new Map() };
  let tick = 0;
  let held = false, release = null, raceStarted = false;
  const time = () => `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`;
  const responseRows = (rows) => Response.json(rows, { headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" } });
  const request = async (url, init) => {
    const path = url.pathname;
    const isSecret = init.headers.apikey === "sb_secret_test";
    if (path.endsWith("operatr_rotation_lab_marker")) return Response.json(isSecret ? [{ marker: "operatr-rotation-lab-only-v1" }] : []);
    if (path.endsWith("operatr_rotation_role_check")) return isSecret ? Response.json(true) : Response.json({ code: "42501" }, { status: 403 });
    if (path.endsWith("operatr_lab_hold_rotation_row")) {
      if (helperUnavailable) return Response.json({}, { status: 404 });
      held = true;
      raceStarted = true;
      release = new Promise((resolve) => setTimeout(() => { held = false; resolve(); }, 700));
      await release;
      return Response.json(true);
    }
    if (path.endsWith("operatr_lab_rotation_lock_held")) return helperUnavailable ? Response.json({}, { status: 404 }) : Response.json(held);
    if (path.includes("/rpc/")) {
      if (held) await release;
      const body = JSON.parse(init.body);
      const isVault = path.endsWith("operatr_rotate_vault_credential");
      const table = tables[isVault ? "vault_credentials" : "google_workspace_connections"];
      const row = table.get(isVault ? body.p_id : body.p_user_id);
      const cipher = isVault ? "encrypted_credential" : "encrypted_refresh_token";
      const matches = Boolean(row && row.user_id === body.p_user_id && row.updated_at === body.p_updated_at && row[cipher] === body.p_old_ciphertext && (!isVault || (row.provider === body.p_provider && row.key_id === body.p_old_key_id && row.encryption_version === body.p_old_version)));
      if (matches || brokenConflict || (brokenRace && raceStarted)) {
        row[cipher] = body.p_new_ciphertext;
        if (isVault) { row.key_id = body.p_new_key_id; row.encryption_version = body.p_new_version; }
        row.updated_at = time();
        return Response.json(true);
      }
      return Response.json(false);
    }
    const name = path.split("/").pop();
    const table = tables[name];
    if (!table) return Response.json({}, { status: 404 });
    const pk = name === "vault_credentials" ? "id" : "user_id";
    const key = url.searchParams.get(pk)?.slice(3);
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      table.set(body[pk], { ...body, updated_at: body.updated_at || time() });
      return Response.json(init.headers.Prefer ? [table.get(body[pk])] : null, { status: 201 });
    }
    if (init.method === "PATCH") {
      const row = table.get(key);
      if (!row) return Response.json([]);
      Object.assign(row, JSON.parse(init.body), { updated_at: time() });
      return Response.json([row]);
    }
    if (init.method === "DELETE") { table.delete(key); return new Response(null, { status: 204 }); }
    if (key) return responseRows(table.has(key) ? [table.get(key)] : []);
    return responseRows([...table.values()]);
  };
  return { request, tables };
}
const options = { stagingUrl: "https://testproject.supabase.co", appUrl: "https://production.supabase.co", stagingSecret: "sb_secret_test", stagingPublishable: "sb_publishable_test" };

test("staging drill rotates, restores synthetic snapshot and cleans up against a simulated Data API", async () => {
  const fake = backend(); const lines = [];
  await runIsolatedRotationTest({ ...options, request: fake.request, log: (line) => lines.push(line) });
  assert.equal(lines.filter((line) => line.startsWith("PASS:")).length, 7);
  assert.equal(fake.tables.vault_credentials.size, 0);
  assert.equal(fake.tables.google_workspace_connections.size, 0);
});
test("concurrency check detects two apparent winners and cleans up", async () => {
  const fake = backend({ brokenRace: true }); const lines = [];
  await assert.rejects(runIsolatedRotationTest({ ...options, request: fake.request, log: (line) => lines.push(line) }));
  assert.ok(lines.includes("FAIL: concurrent updates did not produce exactly one winner."));
  assert.equal(fake.tables.vault_credentials.size, 0);
  assert.equal(fake.tables.google_workspace_connections.size, 0);
});
test("missing concurrency helpers are inconclusive and do not leave synthetic rows", async () => {
  const fake = backend({ helperUnavailable: true }); const lines = [];
  await assert.rejects(runIsolatedRotationTest({ ...options, request: fake.request, log: (line) => lines.push(line) }));
  assert.ok(lines.some((line) => line.startsWith("INCONCLUSIVE:")));
  assert.equal(fake.tables.vault_credentials.size, 0);
  assert.equal(fake.tables.google_workspace_connections.size, 0);
});
test("test refuses the configured Operatr project before making any network request", async () => {
  let called = false;
  await assert.rejects(runIsolatedRotationTest({ ...options, stagingUrl: options.appUrl, request: async () => { called = true; } }), /matches/);
  assert.equal(called, false);
});
test("a vulnerable stale update is detected and synthetic rows are cleaned up", async () => {
  const fake = backend({ brokenConflict: true }); const lines = [];
  await assert.rejects(runIsolatedRotationTest({ ...options, request: fake.request, log: (line) => lines.push(line) }));
  assert.ok(lines.includes("FAIL: stale update was accepted."));
  assert.equal(fake.tables.vault_credentials.size, 0);
  assert.equal(fake.tables.google_workspace_connections.size, 0);
});
