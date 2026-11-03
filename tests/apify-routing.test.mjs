import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function runtime(dataset = [{ reasonCode: "empty", url: "https://reddit.com/r/example" }]) {
  let started;
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/server/apify.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {}, URL, URLSearchParams, AbortSignal, DOMException, Response,
    require: () => ({ ChatRuntimeError: class extends Error {} }),
    fetch: async (url, options) => {
      if (url.includes("/acts/")) {
        started = { url, input: JSON.parse(options.body) };
        return Response.json({ data: { id: "run" } });
      }
      if (url.includes("/dataset/")) return Response.json(dataset);
      return Response.json({ data: { status: "SUCCEEDED" } });
    },
  };
  vm.runInNewContext(code, context);
  return { api: context.exports, started: () => started };
}

test("routes explicit sources and opinion requests ahead of competitor pricing", () => {
  const { api } = runtime();
  for (const prompt of [
    "Are there any opinions on Reddit around OpenAI pricing?",
    "What do people think about OpenAI pricing?",
    "What do users say about https://openai.com/pricing?",
    "Summarize https://www.reddit.com/r/ChatGPT/",
    "What is r/ChatGPT discussing?",
  ]) assert.equal(api.selectApifyTask(prompt), "reddit_signal", prompt);
  for (const prompt of ["Compare OpenAI and Anthropic pricing", "What are the features of https://openai.com/pricing?"])
    assert.equal(api.selectApifyTask(prompt), "competitor_site", prompt);
  assert.equal(api.selectApifyTask("What has Tavily been posting on LinkedIn?"), "linkedin_company");
});

test("extracts post evidence from keyword actor output and excludes NSFW", async () => {
  const { api } = runtime([
    { title: "Pricing thoughts", text: "A user describes their experience.", url: "https://www.reddit.com/r/example/comments/abc/", createDate: "2026-10-10", statistics: { score: 7, commentCount: 3 } },
    { title: "Adult post", text: "Excluded", isNsfw: true },
  ]);
  const result = await api.runApifyTask({ task: "reddit_signal", prompt: "What do people think about OpenAI pricing?", credential: "test", signal: AbortSignal.timeout(5000) });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].publishedAt, "2026-10-10");
  assert.match(result.sources[0].content, /score 7.*3 comments/);
});

test("sends a focused search and ignores empty actor records", async () => {
  const { api, started } = runtime();
  const prompt = "Are there any opinions on Reddit around OpenAI pricing?";
  const result = await api.runApifyTask({ task: api.selectApifyTask(prompt), prompt, credential: "test", signal: AbortSignal.timeout(5000) });
  assert.match(started().url, /batscrape~reddit-scraper/);
  assert.equal(started().input.keywords[0], "OpenAI pricing");
  assert.equal(started().input.maxItemsPerQuery, 10);
  assert.equal(result.sources.length, 0);
});

test("uses a direct Reddit URL as an actor target", async () => {
  const { api, started } = runtime();
  const prompt = "Summarize https://www.reddit.com/r/ChatGPT/";
  await api.runApifyTask({ task: api.selectApifyTask(prompt), prompt, credential: "test", signal: AbortSignal.timeout(5000) });
  assert.equal(started().input.startUrls[0].url, "https://www.reddit.com/r/ChatGPT/");
  assert.equal(started().input.maxPostsPerCommunity, 15);
});
