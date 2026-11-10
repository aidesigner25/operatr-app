import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";

function setup(env, fetchImpl = async () => { throw new Error("unexpected fetch"); }) {
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/server/rate-limit.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => id === "node:crypto" ? { createHash } : {}, process: { env }, URL, AbortSignal, fetch: fetchImpl, Date, Map, Number };
  vm.runInNewContext(code, context);
  return context.exports.allowRequest;
}

test("local development enforces a limit per key", async () => {
  const allow = setup({ NODE_ENV: "development" });
  assert.equal(await allow("chat:user-a", 2), true);
  assert.equal(await allow("chat:user-a", 2), true);
  assert.equal(await allow("chat:user-a", 2), false);
  assert.equal(await allow("chat:user-b", 2), true);
});

test("shared limiter sends an atomic script and does not expose the user ID", async () => {
  let args;
  const allow = setup({ NODE_ENV: "production", OPERATR_REDIS_REST_URL: "https://redis.example", OPERATR_REDIS_REST_TOKEN: "test-token" }, async (url, options) => {
    args = { url, options }; return Response.json({ result: 2 });
  });
  assert.equal(await allow("chat:user-a", 2, 60000), true);
  const command = JSON.parse(args.options.body);
  assert.equal(command[0], "EVAL");
  assert.match(command[1], /INCR/);
  assert.match(command[1], /PEXPIRE/);
  assert.equal(command[2], "1");
  assert.equal(command[4], "60000");
  assert.doesNotMatch(args.options.body, /user-a/);
  assert.equal(args.options.redirect, "error");
});

test("production fails closed on missing config, invalid endpoint, errors and exceeded limits", async () => {
  assert.equal(await setup({ NODE_ENV: "production" })("x"), false);
  const env = { NODE_ENV: "production", OPERATR_REDIS_REST_URL: "https://redis.example", OPERATR_REDIS_REST_TOKEN: "token" };
  assert.equal(await setup({ ...env, OPERATR_REDIS_REST_URL: "http://redis.example" })("x"), false);
  assert.equal(await setup(env, async () => { throw new Error("offline"); })("x"), false);
  assert.equal(await setup(env, async () => Response.json({ result: 13 }))("x", 12), false);
  assert.equal(await setup(env, async () => Response.json({ error: "bad" }))("x"), false);
});
