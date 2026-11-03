import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup(searchResults) {
  const queries = [];
  const crawls = [];
  class ChatRuntimeError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const source = readFileSync(new URL("../src/lib/server/apify.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: () => ({ ChatRuntimeError }), URL, URLSearchParams, AbortSignal, DOMException, Response,
    fetch: async (url, options) => {
      if (url.includes("web-search")) { const input = JSON.parse(options.body); queries.push(input); return Response.json({ results: searchResults(input.query) }); }
      if (url.includes("/acts/")) { crawls.push(JSON.parse(options.body)); return Response.json({ data: { id: "run" } }); }
      if (url.includes("/dataset/")) return Response.json([]);
      return Response.json({ data: { status: "SUCCEEDED" } });
    },
  };
  vm.runInNewContext(code, context);
  const run = (prompt) => context.exports.runApifyTask({ task: context.exports.selectApifyTask(prompt), prompt, credential: "test", signal: AbortSignal.timeout(5000) });
  return { queries, crawls, run, api: context.exports };
}

test("identifies Supabase and rejects unrelated higher-ranked search results", async () => {
  const mock = setup(() => [{ url: "https://www.mlive.com/prices" }, { url: "https://www.wiser.com/pricing" }, { url: "https://supabase.com/pricing" }]);
  const prompt = "Can you give me a brief on supabase given their website, including what they do and their main pricing details.";
  assert.equal(mock.api.selectApifyTask(prompt), "competitor_site");
  await mock.run(prompt);
  assert.equal(mock.queries[0].query, "supabase official pricing");
  assert.equal(mock.queries[0].maxResults, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(mock.crawls[0].startUrls)), [{ url: "https://supabase.com/" }, { url: "https://supabase.com/pricing" }]);
});

test("preserves NVIDIA instead of interpreting consumer AI as a company", async () => {
  const mock = setup(() => [{ url: "https://captechconsulting.com/articles/consumer-ai" }, { url: "https://www.nvidia.com/en-us/geforce/" }]);
  await mock.run("Summarize NVIDIA product features and hardware for consumer AI, including RTX GPUs. What do the official sources suggest about its priorities?");
  assert.equal(mock.queries[0].query, "NVIDIA official features hardware GPU RTX consumer AI");
  assert.equal(mock.crawls[0].startUrls[0].url, "https://www.nvidia.com/en-us/geforce/");
});

test("does not crawl unrelated pages when no company domain matches", async () => {
  const mock = setup(() => [{ url: "https://www.wiser.com/pricing" }, { url: "https://supabase.example.com/pricing" }]);
  // The second hostname is a subdomain, not a company-controlled registrable
  // domain, so it must not be accepted merely because a label matches.
  await assert.rejects(() => mock.run("Can you give me a brief on supabase given their website, including what they do and their main pricing details."), (error) => error.code === "apify_target_required");
  assert.equal(mock.crawls.length, 0);
});

test("keeps separate company searches for a pricing comparison", async () => {
  const mock = setup((query) => query.toLowerCase().startsWith("anthropic") ? [{ url: "https://www.anthropic.com/pricing" }] : [{ url: "https://x.ai/api" }]);
  await mock.run("Can you compare anthropic and xai's pricing strategies from a competitive standpoint?");
  assert.deepEqual(mock.queries.map((query) => query.query), ["anthropic official pricing", "xai official pricing"]);
  assert.equal(mock.crawls[0].startUrls.length, 2);
});
