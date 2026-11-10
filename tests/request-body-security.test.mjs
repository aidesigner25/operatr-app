import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../src/lib/server/request-body.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, require: () => ({}), TextDecoder, JSON };
vm.runInNewContext(code, context);
const read = context.exports.readJsonBody;
function request(body, headers = {}) { return new Request("http://localhost", { method: "POST", body, headers }); }
test("bounded JSON reader checks actual bytes, not just Content-Length", async () => {
  assert.equal((await read(request('{"ok":true}'), 100)).ok, true);
  assert.equal(await read(request('{"ok":true}', { "content-length": "1000" }), 100), null);
  assert.equal(await read(request('"' + 'x'.repeat(100) + '"'), 100), null);
  assert.equal(await read(request('not-json'), 100), null);
  assert.equal(await read(request(new Uint8Array([0xff])), 100), null);
});
