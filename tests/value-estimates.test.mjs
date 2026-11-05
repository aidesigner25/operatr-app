import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const messageId = "12345678-1234-1234-1234-123456789abc";
function route({ ownsMessage = true, authenticated = true } = {}) {
  let saved;
  const modules = {
    "@/lib/server/http": { createRequestId: () => "request", jsonError: (code, message, id, status) => Response.json({ error: { code, message } }, { status }), jsonOk: (data) => Response.json({ data }) },
    "@/lib/server/supabase": { getAuthenticatedRequest: async () => authenticated ? { user: { id: "owner" }, accessToken: "jwt" } : null, supabaseRest: async (path, token, init = {}) => {
      if (path.startsWith("chat_messages")) return { data: ownsMessage ? [{ id: messageId, conversation_id: "conversation" }] : [], error: null };
      if (path.startsWith("profiles")) return { data: [{ hourly_rate: 225 }], error: null };
      if (init.method === "POST") { saved = JSON.parse(init.body); return { data: [saved], error: null }; }
      if (init.method === "DELETE") { saved = undefined; return { data: null, error: null }; }
      return { data: saved ? [saved] : [], error: null };
    } },
    "@/lib/server/rate-limit": { allowRequest: () => true },
  };
  const source = readFileSync(new URL("../src/app/api/value-estimates/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => modules[id], URL, Response, process: { env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } } };
  vm.runInNewContext(code, context);
  return { api: context.exports, saved: () => saved };
}
function request(method, minutes, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000/api/value-estimates?messageId=${messageId}`, { method, headers: { origin, "content-type": "application/json" }, ...(method === "PUT" ? { body: JSON.stringify({ minutes }) } : {}) });
}

test("saving snapshots the owner's current hourly rate and supports updating or deleting", async () => {
  const { api, saved } = route();
  assert.equal((await api.PUT(request("PUT", 90))).status, 200);
  assert.equal(saved().minutes_saved, 90);
  assert.equal(saved().hourly_rate, 225);
  assert.equal(saved().user_id, "owner");
  assert.equal(saved().source, "user");
  assert.equal(saved().conversation_id, "conversation");
  assert.equal((await api.PUT(request("PUT", 30))).status, 200);
  assert.equal(saved().minutes_saved, 30);
  assert.equal((await api.DELETE(request("DELETE"))).status, 200);
  assert.equal(saved(), undefined);
});

test("rejects invalid minutes, cross-origin writes and responses not owned by the user", async () => {
  const first = route();
  assert.equal((await first.api.PUT(request("PUT", -1))).status, 400);
  assert.equal((await first.api.PUT(request("PUT", 1.5))).status, 400);
  assert.equal((await first.api.PUT(request("PUT", 20, "https://evil.example"))).status, 403);
  assert.equal((await route({ ownsMessage: false }).api.PUT(request("PUT", 20))).status, 404);
  assert.equal((await route({ authenticated: false }).api.PUT(request("PUT", 20))).status, 401);
  assert.equal(first.saved(), undefined);
});
