import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
function load() {
  const source = readFileSync(new URL("../src/lib/server/research-source-list.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: () => ({}), URL, Map };
  vm.runInNewContext(code, context);
  return context.exports;
}
test("lists unique retrieved links even when the model omitted citations", () => {
  const { researchSourceSuffix } = load();
  const result = researchSourceSuffix([{ title: "Reddit [post]", url: "https://www.reddit.com/r/test/comments/abc/" }, { title: "duplicate", url: "https://www.reddit.com/r/test/comments/abc/" }], "A summary without links");
  assert.match(result, /Retrieved research links/);
  assert.match(result, /not necessarily citations/);
  assert.match(result, /\[Reddit post\]\(https:\/\/www.reddit.com\/r\/test\/comments\/abc\/\)/);
  assert.equal((result.match(/https:\/\//g) || []).length, 1);
});
test("reports missing links and never emits unsafe schemes", () => {
  const { researchSourceSuffix } = load();
  assert.match(researchSourceSuffix([{ title: "post" }, { title: "bad", url: "javascript:alert(1)" }], "answer"), /without direct source links/);
  assert.equal(researchSourceSuffix([{ title: "a", url: "https://example.com/" }], "[a](https://example.com/)"), "");
});
