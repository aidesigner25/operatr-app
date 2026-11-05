import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
function load(output, options = {}) {
  let calls = 0, saved, savePath, saveOptions, modelInput, resumed = false, closed = false;
  const modules = {
    "@/lib/server/chat-provider": { streamProviderResponse: async function* (input) { modelInput = input; calls++; try { if (options.fail) throw new Error("provider unavailable"); if (options.error) throw Object.assign(new Error("provider error"), options.error); if (options.transient && calls === 1) throw Object.assign(new Error("busy"), { retryable: true }); for (const part of options.outputs ? [options.outputs[calls - 1]] : Array.isArray(output) ? output : [output]) yield part; resumed = true; if (options.incomplete) throw Object.assign(new Error("closed"), { code: "provider_incomplete_stream" }); } finally { closed = true; } } },
    "@/lib/server/supabase": { supabaseRest: async (path, token, init = {}) => {
      if (path.startsWith("chat_value_estimates?") && options.migrationMissing) return { error: "missing" };
      if (path.startsWith("profiles")) return { data: [{ hourly_rate: 150 }], error: null };
      if (init.method === "POST" || init.method === "PATCH") { saved = JSON.parse(init.body); savePath = path; saveOptions = init; return { data: options.noMatch ? [] : [{}], error: options.conflict || options.writeFailed ? "failed" : null }; }
      return { data: [], error: null };
    } },
  };
  const source = readFileSync(new URL("../src/lib/server/value-assessment.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const abortApi = { timeout: (ms) => options.timeout && ms === 30000 ? AbortSignal.abort(new DOMException("Timed out", "TimeoutError")) : AbortSignal.timeout(ms), any: (signals) => AbortSignal.any(signals) };
  const context = { exports: {}, require: (name) => modules[name], AbortSignal: abortApi, setTimeout: (fn) => { fn(); return 0; } };
  vm.runInNewContext(code, context);
  return { api: context.exports, calls: () => calls, saved: () => saved, savePath: () => savePath, saveOptions: () => saveOptions, modelInput: () => modelInput, resumed: () => resumed, closed: () => closed };
}
const input = { userId: "user", accessToken: "token", messageId: "message", conversationId: "conversation", provider: "openai", model: "test", responseStyle: "medium", credential: "key", prompt: "Compare competitors", answer: "Analysis", recentContext: "", research: "Tavily sources: 3", signal: new AbortController().signal };

test("assessments accept only zero or bounded substantial estimates", () => {
  const { api } = load("");
  assert.equal(api.parseValueAssessment('{"minutes":0}').source, "not_applicable");
  assert.equal(api.parseValueAssessment('{"minutes":45}').minutes, 45);
  for (const output of ['{"minutes":29}', '{"minutes":961}', '{"minutes":-1}', '{"minutes":"60"}', 'bad']) assert.equal(api.parseValueAssessment(output), null);
});
test("automatic assessment captures the user's hourly rate, with zero excluded from value", async () => {
  const normal = load('{"minutes":90}');
  const result = await normal.api.assessValue(input);
  assert.equal(result.status, "saved");
  assert.equal(normal.saved().source, "model");
  assert.equal(normal.saved().hourly_rate, 150);
  const quick = load('{"minutes":0}');
  assert.equal((await quick.api.assessValue(input)).status, "saved");
  assert.equal(quick.saved().source, "not_applicable");
  assert.equal(quick.saved().minutes_saved, 0);
});
test("model failure and missing migration produce no invented estimate or extra call", async () => {
  const failure = load("", { fail: true });
  assert.equal((await failure.api.assessValue(input)).status, "model_unavailable");
  assert.equal(failure.saved(), undefined);
  const missing = load('{"minutes":60}', { migrationMissing: true });
  assert.equal((await missing.api.assessValue(input)).status, "storage_unavailable");
  assert.equal(missing.calls(), 0);
});
test("an existing assessment or user edit is not overwritten by the automatic insert", async () => {
  const conflict = load('{"minutes":60}', { conflict: true });
  assert.equal((await conflict.api.assessValue(input)).status, "storage_write_failed");
  assert.equal(conflict.saved().source, "model");
  assert.equal(conflict.savePath(), "chat_value_estimates");
  assert.equal(conflict.saveOptions().headers.Prefer, "return=minimal");
});
test("a transient pre-output failure retries once within the same assessment", async () => {
  const retry = load('Estimated result: {"minutes":45}', { transient: true });
  assert.equal((await retry.api.assessValue(input)).status, "saved");
  assert.equal(retry.saved().minutes_saved, 45);
  assert.equal(retry.calls(), 2);
});
test("complete JSON survives an interrupted metadata stream without guessing from partial JSON", async () => {
  const complete = load('{"minutes":60}', { incomplete: true });
  assert.equal((await complete.api.assessValue(input)).status, "saved");
  assert.equal(complete.saved().minutes_saved, 60);
  const incomplete = load('{"minutes":', { incomplete: true });
  assert.equal((await incomplete.api.assessValue(input)).status, "model_incomplete");
  assert.equal(incomplete.saved(), undefined);
});
test("a complete streamed JSON estimate is saved immediately without waiting for the provider to finish", async () => {
  const task = load(['{"minutes":', '60}']);
  assert.equal((await task.api.assessValue(input)).status, "saved");
  assert.equal(task.saved().minutes_saved, 60);
  assert.equal(task.resumed(), false);
  assert.equal(task.closed(), true);
});
test("distinguishes a timeout, transient provider rejection, and connection failure without exposing errors", async () => {
  assert.equal((await load("", { timeout: true }).api.assessValue(input)).status, "model_timeout");
  assert.equal((await load("", { error: { code: "provider_error", retryable: true } }).api.assessValue(input)).status, "model_busy");
  assert.equal((await load("", { error: { code: "provider_network_error", retryable: true } }).api.assessValue(input)).status, "model_connection");
  assert.equal((await load("", { error: { code: "provider_error", retryable: false } }).api.assessValue(input)).status, "model_rejected");
});
test("assessment sends a bounded excerpt and reports storage failures distinctly", async () => {
  const task = load('{"minutes":60}', { writeFailed: true });
  const result = await task.api.assessValue({ ...input, answer: "a".repeat(20_000), prompt: "p".repeat(5000), recentContext: "c".repeat(5000) });
  assert.equal(result.status, "storage_write_failed");
  assert.ok(task.modelInput().messages[0].content.length < 4000);
  assert.equal(task.modelInput().model, input.model);
});

test("reassessment conditionally replaces only a non-applicable row", async () => {
  const retry = load('{"minutes":90}');
  const result = await retry.api.assessValue({ ...input, replaceNotApplicable: true, previousSegments: ["First section", "Second section"] });
  assert.equal(result.status, "saved");
  assert.match(retry.savePath(), /source=eq.not_applicable/);
  assert.equal(retry.saveOptions().method, "PATCH");
  const summary = JSON.parse(retry.modelInput().messages[0].content);
  assert.equal(summary.segment_count, 3);
  assert.deepEqual(Array.from(summary.response_excerpts), ["First section", "Second section", "Analysis"]);
});

test("a substantial confirmed file gets a second judgment when the first returns zero", async () => {
  const task = load("", { outputs: ['{"minutes":0}', '{"minutes":180}'] });
  const result = await task.api.assessValue({ ...input, answer: "Research and tables ".repeat(100), assetDelivery: { kind: "sheet", status: "created" } });
  assert.equal(result.status, "saved");
  assert.equal(task.calls(), 2);
  assert.equal(task.saved().minutes_saved, 180);
  assert.equal(JSON.parse(task.modelInput().messages[0].content).file_delivery.status, "created");
  assert.match(task.modelInput().systemInstruction, /excluding earlier completed work/);
});
test("rechecking does not force a positive estimate or count an unconfirmed file", async () => {
  const quick = load("", { outputs: ['{"minutes":0}', '{"minutes":0}'] });
  await quick.api.assessValue({ ...input, answer: "x".repeat(1500), assetDelivery: { kind: "sheet", status: "created" } });
  assert.equal(quick.calls(), 2);
  assert.equal(quick.saved().source, "not_applicable");
  const failed = load('{"minutes":0}');
  await failed.api.assessValue({ ...input, answer: "x".repeat(1500), assetDelivery: { kind: "sheet", status: "unconfirmed" } });
  assert.equal(failed.calls(), 1);
  assert.equal(failed.saved().source, "not_applicable");
  const brief = load('{"minutes":0}');
  await brief.api.assessValue({ ...input, assetDelivery: { kind: "sheet", status: "created" } });
  assert.equal(brief.calls(), 1);
});
test("failed verification does not save a guessed estimate", async () => {
  const task = load("", { outputs: ['{"minutes":0}', 'invalid'] });
  const result = await task.api.assessValue({ ...input, answer: "x".repeat(1500), assetDelivery: { kind: "sheet", status: "created" } });
  assert.equal(result.status, "model_invalid");
  assert.equal(task.saved(), undefined);
});
