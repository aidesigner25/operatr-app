import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
function provider(data) {
  const source = readFileSync(new URL("../src/lib/server/chat-provider.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => id.includes("chat-types") ? { resolvedModel: (model) => model } : {}, fetch: async () => data instanceof Response ? data : new Response(data), Response, TextDecoder, Uint8Array, AbortSignal, DOMException };
  vm.runInNewContext(code, context);
  return context.exports;
}
async function read(providerId, data) {
  const api = provider(data);
  let content = "";
  try {
    for await (const delta of api.streamProviderResponse({ provider: providerId, model: "test", credential: "key", responseStyle: "medium", messages: [], systemInstruction: "test", signal: AbortSignal.timeout(5000) })) content += delta;
    return { content, error: null };
  } catch (error) { return { content, error: error.code }; }
}
const sse = (x) => `data: ${JSON.stringify(x)}\n\n`;

test("OpenAI-compatible streams require a completion marker", async () => {
  const delta = sse({ choices: [{ delta: { content: "Hello" } }] });
  assert.deepEqual(await read("openrouter", `${delta}data: [DONE]\n\n`), { content: "Hello", error: null });
  assert.deepEqual(await read("openrouter", delta), { content: "Hello", error: "provider_incomplete_stream" });
});
test("Anthropic streams require a completion marker", async () => {
  const delta = sse({ type: "content_block_delta", delta: { text: "Hello" } });
  assert.deepEqual(await read("anthropic", delta + sse({ type: "message_stop" })), { content: "Hello", error: null });
  assert.deepEqual(await read("anthropic", delta), { content: "Hello", error: "provider_incomplete_stream" });
});
test("Gemini streams require a successful finish reason", async () => {
  const delta = sse({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] });
  assert.deepEqual(await read("google", delta + sse({ candidates: [{ finishReason: "STOP" }] })), { content: "Hello", error: null });
  assert.deepEqual(await read("google", delta), { content: "Hello", error: "provider_incomplete_stream" });
  assert.deepEqual(await read("google", delta + sse({ candidates: [{ finishReason: "SAFETY" }] })), { content: "Hello", error: "provider_incomplete_stream" });
});
test("stopping a metadata stream early cancels the underlying provider reader", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { content: '{"minutes":60}' } }] }))); }, cancel() { cancelled = true; } });
  const api = provider(new Response(stream));
  for await (const delta of api.streamProviderResponse({ provider: "openrouter", model: "test", credential: "key", responseStyle: "concise", messages: [], systemInstruction: "test", signal: AbortSignal.timeout(5000) })) {
    assert.equal(delta, '{"minutes":60}');
    break;
  }
  assert.equal(cancelled, true);
});
test("OpenAI-compatible native tool calls are not mistaken for an answer", async () => {
  const delta = sse({ choices: [{ delta: { tool_calls: [{ id: "call", function: { name: "websearch" } }] } }] });
  assert.deepEqual(await read("openrouter", delta + "data: [DONE]\n\n"), { content: "", error: "provider_unavailable_tool" });
});
