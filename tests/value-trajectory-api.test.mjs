import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
function setup() {
  const calls = [];
  const modules = {
    "@/lib/server/http": { createRequestId: () => "id", jsonError: (code, message, id, status) => Response.json({ error: { code, message } }, { status }), jsonOk: (data) => Response.json({ data }) },
    "@/lib/server/supabase": { getAuthenticatedRequest: async () => ({ user: { id: "owner" }, accessToken: "token" }), supabaseRest: async (path, token, init) => { calls.push({ path, token, input: JSON.parse(init.body) }); return { data: { count: 0, minutes: 0, value: 0, months: [], days: [] } }; } },
    "@/lib/server/rate-limit": { allowRequest: () => true },
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/app/api/value-estimates/summary/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, require: (name) => modules[name], URL, Intl, Response }; vm.runInNewContext(code, context);
  return { api: context.exports, calls };
}
test("weekly and monthly totals use the authenticated user's requested time zone", async () => {
  const t = setup();
  assert.equal((await t.api.GET(new Request("https://example.test/api/value-estimates/summary?timezone=America%2FLos_Angeles"))).status, 200);
  assert.equal(t.calls[0].path, "rpc/value_estimate_summary_local");
  assert.equal(t.calls[0].token, "token");
  assert.equal(t.calls[0].input.p_timezone, "America/Los_Angeles");
});
test("invalid time zones fall back to UTC", async () => {
  const t = setup(); await t.api.GET(new Request("https://example.test/api/value-estimates/summary?timezone=bad"));
  assert.equal(t.calls[0].input.p_timezone, "UTC");
});
