import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function provider(response) {
  const source = readFileSync(new URL("../src/lib/server/chat-provider.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => id.includes("chat-types") ? { resolvedModel: (x) => x } : {}, fetch: async () => new Response(response), Response, TextDecoder, Uint8Array, AbortSignal, DOMException };
  vm.runInNewContext(code, context);
  return context.exports;
}

test("fallback titles remove polite lead-ins and retain brand names", () => {
  const api = provider("");
  assert.equal(api.deriveConversationTitle("Can you compare anthropic and xai's pricing strategies from a competitive standpoint?"), "Comparing Anthropic and xAI Pricing");
  assert.equal(api.deriveConversationTitle("Thank you, could you tell me a bit about openai's pricing and help unpack their monetization strategy based on this information?"), "OpenAI Pricing and Monetization Strategy");
});

test("model titles are validated and rendered in title case", async () => {
  const data = `data: ${JSON.stringify({ choices: [{ delta: { content: "comparing anthropic and xAI pricing" } }] })}\n\ndata: [DONE]\n\n`;
  const api = provider(data);
  const title = await api.generateConversationTitle({ provider: "openrouter", model: "test", credential: "test", openingMessage: "compare pricing", signal: AbortSignal.timeout(5000) });
  assert.equal(title, "Comparing Anthropic and xAI Pricing");
});
