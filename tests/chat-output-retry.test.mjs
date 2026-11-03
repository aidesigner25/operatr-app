import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("retries a no-text output limit using the same research and a bounded larger budget", async () => {
  class ChatRuntimeError extends Error {
    constructor(code, message, status = 400, retryable = false) { super(message); Object.assign(this, { code, status, retryable }); }
  }
  let modelCalls = 0;
  let researchCalls = 0;
  const calls = [];
  const store = {
    getConversation: async () => ({ data: { provider: "openrouter", model: "test", response_style: "medium" } }),
    saveMessage: async () => ({}), listMessages: async () => ({ data: [{ role: "user", content: "Reddit opinions" }, { role: "assistant", content: "previous" }] }),
    toProviderMessages: (items) => items, createAgentRun: async () => ({ data: { id: "run" } }),
    saveAgentTraceEvent: async () => ({}), finishAgentRun: async () => ({}), touchConversation: async () => ({}),
  };
  const modules = {
    "@/lib/server/http": { createRequestId: () => "request", jsonError: () => { throw new Error("unexpected error"); } },
    "@/lib/server/supabase": { getAuthenticatedRequest: async () => ({ user: { id: "user" }, accessToken: "token" }) },
    "@/lib/server/rate-limit": { allowRequest: () => true },
    "@/lib/server/chat-store": store,
    "@/lib/server/chat-provider": { ChatRuntimeError, loadProviderCredential: async () => "key", streamProviderResponse: async function* (input) {
      calls.push(input); modelCalls++;
      if (modelCalls === 1) throw new ChatRuntimeError("provider_output_limit", "limit");
      yield "A grounded answer";
    } },
    "@/lib/server/feature-flags": { getFeatureFlags: () => ({ chat: true, apify: true }) },
    "@/lib/server/agent-runtime": { AGENT_RUNTIME_TIMEOUT_MS: 90000, boundedProviderMessages: x => x, maxOutputTokensFor: () => 2000, isSafeRetryable: () => false, runStatusFor: () => "failed" },
    "@/lib/server/operator-profile": { loadOperatorPreferences: async () => ({}), operatorSystemInstruction: () => "base" },
    "@/lib/server/tavily": {},
    "@/lib/server/apify": { selectApifyTask: () => "reddit_signal", runApifyTask: async () => { researchCalls++; return { label: "Reddit", sources: [{ title: "post" }] }; }, apifyResearchInstruction: () => " RESEARCH" },
  };
  const source = readFileSync(new URL("../src/app/api/chat/conversations/[conversationId]/messages/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (name) => modules[name], Request, Response, ReadableStream, TextEncoder, AbortSignal, DOMException };
  vm.runInNewContext(code, context);
  const request = new Request("https://localhost/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "Reddit opinions", useApify: true }) });
  const response = await context.exports.POST(request, { params: Promise.resolve({ conversationId: "conversation" }) });
  const stream = await response.text();
  assert.match(stream, /A grounded answer/);
  assert.equal(modelCalls, 2);
  assert.equal(researchCalls, 1);
  assert.equal(calls[0].maxTokens, 2000);
  assert.equal(calls[1].maxTokens, 4000);
  assert.equal(calls[1].lowReasoningEffort, true);
  assert.equal(calls[1].systemInstruction, "base RESEARCH");
});
