import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as formatter from "../src/lib/server/google-format.ts";

function load(fetcher) {
  const source = readFileSync(new URL("../src/lib/server/google-export.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const workspace = { googleConfig: () => ({ clientId: "id", clientSecret: "secret" }), loadGoogleRefreshToken: async () => "refresh" };
  const context = { exports: {}, require: (id) => id === "node:crypto" ? crypto : id.includes("google-workspace") ? workspace : id.includes("google-format") ? formatter : {}, URLSearchParams, AbortSignal, fetch: fetcher, Response };
  vm.runInNewContext(code, context);
  return context.exports;
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const input = { title: "Report", content: "Intro\n\nName | Amount\n--- | ---\nAlpha | =1+1\n\nEnd", kind: "sheet", userId: "u", accessToken: "a" };

test("sheet export styles table and prose and stores formulas as literal strings", async () => {
  let body;
  const api = load(async (url, options) => {
    if (url.includes("oauth2.googleapis.com")) return response({ access_token: "access" });
    body = JSON.parse(options.body);
    return response({ spreadsheetId: "abc123456789" });
  });
  const result = await api.exportGoogleResponse(input);
  assert.equal(result.url, "https://docs.google.com/spreadsheets/d/abc123456789/edit");
  const sheet = body.sheets[0];
  const rows = sheet.data[0].rowData;
  assert.equal(rows.length, 4);
  assert.equal(rows[0].values[0].userEnteredValue.stringValue, "Intro");
  assert.equal(rows[1].values[1].userEnteredValue.stringValue, "Amount");
  assert.equal(rows[1].values[0].userEnteredFormat.textFormat.bold, true);
  assert.ok(rows[1].values[0].userEnteredFormat.backgroundColor);
  assert.equal(rows[2].values[1].userEnteredValue.stringValue, "=1+1");
  assert.equal(rows[3].values[0].userEnteredValue.stringValue, "End");
  assert.equal(sheet.merges.length, 2);
});

test("Docs HTML preserves headings, emphasis, links, table structure, and escapes untrusted text", () => {
  const blocks = formatter.markdownBlocks("# Hello 🌎\n\n**Bold** and *italic* [link](https://example.com)\n\nName | Amount\n--- | ---\nAlpha | <script>alert(1)</script>\n\n- Item");
  const html = formatter.docHtml(blocks);
  assert.match(html, /<h1\b[^>]*>Hello 🌎<\/h1>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<a href="https:\/\/example.com\/">link<\/a>/);
  assert.match(html, /<table\b/);
  assert.match(html, /<th\b[^>]*>Name<\/th>/);
  assert.match(html, /<td\b[^>]*>Alpha<\/td>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /• Item/);
});

test("Docs export requests conversion of semantic HTML into a Google Doc", async () => {
  let request;
  const api = load(async (url, options) => {
    if (url.includes("oauth2.googleapis.com")) return response({ access_token: "access" });
    request = { url, ...options };
    return response({ id: "abc123456789", mimeType: "application/vnd.google-apps.document" });
  });
  const result = await api.exportGoogleResponse({ ...input, kind: "doc" });
  assert.equal(result.url, "https://docs.google.com/document/d/abc123456789/edit");
  assert.match(request.url, /uploadType=multipart/);
  assert.match(request.headers["Content-Type"], /^multipart\/related; boundary=/);
  assert.match(request.body, /"mimeType":"application\/vnd.google-apps.document"/);
  assert.match(request.body, /Content-Type: text\/html; charset=UTF-8/);
  assert.match(request.body, /<table\b/);
});

test("code is retained and oversized tables are rejected", () => {
  const blocks = formatter.markdownBlocks("```\na | b\n--- | ---\n```\n");
  assert.equal(blocks[0].cells[0][0].text, "a | b\n--- | ---");
  assert.throws(() => formatter.sheetLayout(formatter.markdownBlocks(`${Array(41).fill("x").join("|")}\n${Array(41).fill("---").join("|")}`)), /40 columns/);
});

test("an unconfirmed Docs creation advises checking Drive before retrying", async () => {
  const api = load(async (url) => {
    if (url.includes("oauth2.googleapis.com")) return response({ access_token: "access" });
    throw new Error("connection lost");
  });
  await assert.rejects(api.exportGoogleResponse({ ...input, kind: "doc" }), /Check Drive before retrying/);
});
