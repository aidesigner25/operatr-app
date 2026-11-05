import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../src/lib/shared/task-continuation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, require: () => ({ decodeAttachmentMessage: () => null }) };
vm.runInNewContext(code, context);
const { continuationTask, isContinuationRequest } = context.exports;
const user = (content) => ({ role: "user", content, status: "completed" });
const assistant = (content, status) => ({ role: "assistant", content, status });
test("continuations combine interrupted work under the original request", () => {
  const result = continuationTask([user("Research AI and write a rollout plan"), assistant("research section", "cancelled"), user("continue"), assistant("analysis section", "cancelled"), user("Please continue.")]);
  assert.equal(result.isContinuation, true);
  assert.equal(result.prompt, "Research AI and write a rollout plan");
  assert.deepEqual(Array.from(result.segments), ["research section", "analysis section"]);
});
test("completed work is not included again, and specific new requests still search", () => {
  const result = continuationTask([user("original"), assistant("completed answer", "completed"), user("continue")]);
  assert.equal(result.isContinuation, true);
  assert.equal(result.prompt, "continue");
  assert.equal(result.segments.length, 0);
  assert.equal(isContinuationRequest("continue research on Nvidia"), false);
  assert.equal(continuationTask([user("continue")]).isContinuation, false);
});
