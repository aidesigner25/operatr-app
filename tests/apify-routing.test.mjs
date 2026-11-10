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

test("prefers the Reddit permalink and reconstructs a post link only from a valid ID", async () => {
  const { api } = runtime([
    { title: "Linked article", text: "A discussion", url: "https://news.example/article", permalink: "/r/example/comments/abc123/linked_article/" },
    { title: "Another post", text: "More discussion", id: "t3_def456" },
    { title: "No direct link", text: "A comment", id: "bad/id", url: "https://news.example/article" },
  ]);
  const result = await api.runApifyTask({ task: "reddit_signal", prompt: "What do people think about OpenAI pricing?", credential: "test", signal: AbortSignal.timeout(5000) });
  assert.equal(result.sources[0].url, "https://www.reddit.com/r/example/comments/abc123/linked_article/");
  assert.equal(result.sources[1].url, "https://www.reddit.com/comments/def456/");
  assert.equal(result.sources[2].url, undefined);
});

test("uses both explicit LinkedIn and contextual company targets for follow-ups", async () => {
  const { api, started } = runtime();
  const original = "Can you take a look at what Apple's recent posting activity has been so that we can run a strategic ideation report?";
  assert.equal(api.selectApifyTask(original), "linkedin_company");
  const followup = api.resolveApifyPrompt("Can you use linkedin to gain intel on their recent posting activity?", [original]);
  assert.equal(api.selectApifyTask(followup), "linkedin_company");
  await api.runApifyTask({ task: "linkedin_company", prompt: followup, credential: "test", signal: AbortSignal.timeout(5000) });
  assert.equal(started().input.targets[0], "Apple");
});

test("a same-report follow-up targets the newly named company instead of the previous one", async () => {
  const { api, started } = runtime();
  const prompt = "Excellent, could you please make me a doc conducting the same report, with the same linkedin scan, outlook, and key investment factors, but for costco?";
  const resolved = api.resolveApifyPrompt(prompt, ["Can you take a look at what Apple's recent posting activity has been?"]);
  assert.equal(api.selectApifyTask(resolved), "linkedin_company");
  await api.runApifyTask({ task: "linkedin_company", prompt: resolved, credential: "test", signal: AbortSignal.timeout(5000) });
  assert.equal(started().input.targets[0], "costco");
});


test("recognizes only LinkedIn hosts at a domain boundary", () => {
  const { api } = runtime();
  assert.equal(api.selectApifyTask("Summarize https://linkedin.com/company/example"), "linkedin_posts");
  assert.equal(api.selectApifyTask("Summarize https://www.linkedin.com/company/example"), "linkedin_posts");
  assert.equal(api.selectApifyTask("Summarize https://notlinkedin.com/company/example"), "competitor_site");
  assert.notEqual(api.selectApifyTask("Summarize https://linkedin.com.attacker.com/company/example"), "linkedin_posts");
});
