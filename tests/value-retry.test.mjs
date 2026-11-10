import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
const messageId = "12345678-1234-1234-1234-123456789abc";
function setup({ existing = false, owner = true, continuation = false } = {}) {
  const calls = [], assessments = [];
  class ChatRuntimeError extends Error {}
  const helper = { exports: {}, require: () => ({ decodeAttachmentMessage: () => null }) };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/shared/task-continuation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, helper);
  const modules = {
    "@/lib/server/request-body": { readJsonBody: async (request) => request.json().catch(() => null) },
    "@/lib/server/http": { createRequestId: () => "id", jsonError: (code, message, id, status) => Response.json({ error: { code, message } }, { status }), jsonOk: (data) => Response.json({ data }) },
    "@/lib/server/supabase": { getAuthenticatedRequest: async () => ({ user: { id: "owner" }, accessToken: "jwt" }), supabaseRest: async (path) => {
      calls.push(path);
      if (path.startsWith("chat_value_estimates")) return { data: existing ? [{ message_id: messageId, source: existing === "not_applicable" ? "not_applicable" : "user" }] : [], error: null };
      if (path.includes("role=eq.assistant")) return { data: owner ? [{ id: messageId, conversation_id: "conversation", content: "Saved research response", created_at: "2026-11-04T12:00:00Z", chat_conversations: { provider: "openai", model: "current-model", response_style: "medium" } }] : [], error: null };
      if (path.includes("select=role,content,status")) return { data: continuation ? [{ role: "user", status: "completed", content: "continue" }, { role: "assistant", status: "cancelled", content: "Earlier research" }, { role: "user", status: "completed", content: "Research the topic" }] : [{ role: "user", status: "completed", content: "Research the topic" }], error: null };
      throw new Error("Unexpected request");
    } },
    "@/lib/server/rate-limit": { allowRequest: () => true },
    "@/lib/server/feature-flags": { getFeatureFlags: () => ({ chat: true }) },
    "@/lib/server/chat-provider": { ChatRuntimeError, loadProviderCredential: async () => "key" },
    "@/lib/server/value-assessment": { assessValue: async (input) => { assessments.push(input); return { status: "saved" }; } },
    "@/lib/shared/task-continuation": helper.exports,
  };
  const source = readFileSync(new URL("../src/app/api/value-estimates/retry/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => modules[id], URL, Response, process: { env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } } };
  vm.runInNewContext(code, context);
  const request = (origin = "http://localhost:3000") => new Request("http://localhost:3000/api/value-estimates/retry", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ messageId }) });
  return { api: context.exports, request, calls, assessments };
}
test("retry uses the saved response and current model without calling research tools", async () => {
  const t = setup();
  const response = await t.api.POST(t.request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, "saved");
  assert.equal(t.assessments[0].answer, "Saved research response");
  assert.equal(t.assessments[0].model, "current-model");
  assert.match(t.assessments[0].research, /not rerun/);
  assert.ok(t.calls.every((path) => path.startsWith("chat_")));
});
test("retry preserves existing estimates and rejects another user's response and cross-origin requests", async () => {
  const existing = setup({ existing: true });
  assert.equal((await (await existing.api.POST(existing.request())).json()).data.status, "already_exists");
  assert.equal(existing.assessments.length, 0);
  const other = setup({ owner: false });
  assert.equal((await other.api.POST(other.request())).status, 404);
  const bad = setup();
  assert.equal((await bad.api.POST(bad.request("https://evil.example"))).status, 403);
});

test("reassess a saved zero using the original request and interrupted segments", async () => {
  const t = setup({ existing: "not_applicable", continuation: true });
  assert.equal((await (await t.api.POST(t.request())).json()).data.status, "saved");
  assert.equal(t.assessments[0].prompt, "Research the topic");
  assert.deepEqual(Array.from(t.assessments[0].previousSegments), ["Earlier research"]);
  assert.equal(t.assessments[0].replaceNotApplicable, true);
});
