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

test('provider HTTP errors do not expose upstream text and retain retry behavior', async () => {
  for (const [status,retryable] of [[400,false],[401,false],[429,true],[500,true]]) {
    const api=provider(Response.json({error:{message:'SENSITIVE_UPSTREAM_SENTINEL'}},{status}));
    const stream=api.streamProviderResponse({provider:'openrouter',model:'test',credential:'key',responseStyle:'medium',messages:[],systemInstruction:'test',signal:AbortSignal.timeout(5000)});
    await assert.rejects(async()=>{ for await (const _ of stream) {} }, error=>{
      assert.equal(error.code,'provider_error');
      assert.equal(error.retryable,retryable);
      assert.ok(!error.message.includes('SENSITIVE_UPSTREAM_SENTINEL'));
      if(status===401) assert.match(error.message,/credential or model access/i);
      if(status===429) assert.match(error.message,/rate or usage limit/i);
      return true;
    });
  }
});

test('provider stream errors and malformed events never expose upstream text', async () => {
  for (const [id,event] of [
    ['openrouter',sse({error:{message:'SENSITIVE_UPSTREAM_SENTINEL'}})],
    ['anthropic',sse({type:'error',error:{message:'SENSITIVE_UPSTREAM_SENTINEL'}})],
    ['google',sse({error:{message:'SENSITIVE_UPSTREAM_SENTINEL'}})],
    ['openrouter','data: SENSITIVE_UPSTREAM_SENTINEL\n\n'],
  ]) {
    const api=provider(event);
    const stream=api.streamProviderResponse({provider:id,model:'test',credential:'key',responseStyle:'medium',messages:[],systemInstruction:'test',signal:AbortSignal.timeout(5000)});
    await assert.rejects(async()=>{ for await (const _ of stream) {} },error=>{
      assert.equal(error.code,'provider_stream_error');
      assert.equal(error.retryable,true);
      assert.ok(!error.message.includes('SENSITIVE_UPSTREAM_SENTINEL'));
      return true;
    });
  }
});

test('oversized unframed and completed events are rejected and release the stream', async () => {
  for (const framed of [false,true]) {
    let cancelled=false;
    const payload='data: ' + 'x'.repeat(1_000_001) + (framed?'\n\n':'');
    const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(payload));},cancel(){cancelled=true;}});
    const api=provider(new Response(stream));
    const generated=api.streamProviderResponse({provider:'openrouter',model:'test',credential:'key',responseStyle:'medium',messages:[],systemInstruction:'test',signal:AbortSignal.timeout(5000)});
    await assert.rejects(async()=>{for await(const _ of generated){}},error=>error.code==='provider_stream_error' && error.retryable===false && /oversized/.test(error.message));
    assert.equal(cancelled,true);
  }
});

test('normal provider events may be split across chunks', async () => {
  const event=sse({choices:[{delta:{content:'Hello'}}]})+'data: [DONE]\n\n';
  const stream=new ReadableStream({start(controller){const data=new TextEncoder().encode(event);controller.enqueue(data.slice(0,5));controller.enqueue(data.slice(5));controller.close();}});
  const api=provider(new Response(stream));
  let text='';
  for await(const delta of api.streamProviderResponse({provider:'openrouter',model:'test',credential:'key',responseStyle:'medium',messages:[],systemInstruction:'test',signal:AbortSignal.timeout(5000)})) text+=delta;
  assert.equal(text,'Hello');
});
