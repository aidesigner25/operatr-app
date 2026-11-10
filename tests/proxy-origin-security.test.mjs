import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup(env) {
  const NextResponse = {
    next: () => ({ status: 200 }),
    json: (body, init) => ({ status: init.status, body }),
    redirect: () => ({ status: 307 }),
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: () => ({ NextResponse }), URL, process: { env } };
  vm.runInNewContext(code, context);
  return context.exports;
}
function request(path, method, origin) {
  const url = `https://operatr.example${path}`;
  return { url, method, nextUrl: new URL(url), headers: new Headers(origin === undefined ? {} : { origin }), cookies: { get: () => undefined } };
}
test("blocks cross-origin and missing-origin cookie mutations before route handling", async () => {
  const proxy = setup({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://operatr.example" });
  for (const path of ["/api/auth/session", "/api/profile", "/api/vault/credentials", "/api/chat/conversations"]) {
    assert.equal((await proxy.proxy(request(path, "POST", "https://evil.example"))).status, 403);
    assert.equal((await proxy.proxy(request(path, "DELETE"))).status, 403);
  }
  assert.equal((await proxy.proxy(request("/api/auth/session", "POST", "https://operatr.example"))).status, 200);
  assert.equal((await proxy.proxy(request("/api/health", "GET"))).status, 200);
  assert.ok(proxy.config.matcher.includes("/api/:path*"));
});
test("production requires a configured HTTPS origin and rejects untrusted URL forms", () => {
  const req = request("/api/profile", "PUT", "https://operatr.example");
  assert.equal(setup({ NODE_ENV: "production" }).validMutationOrigin(req), false);
  assert.equal(setup({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://operatr.example" }).validMutationOrigin(req), false);
  assert.equal(setup({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://operatr.example/path" }).validMutationOrigin(req), false);
  assert.equal(setup({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://operatr.example" }).validMutationOrigin(req), true);
});
test("local development accepts the configured localhost origin only", () => {
  const proxy = setup({ NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
  assert.equal(proxy.validMutationOrigin(request("/api/profile", "PUT", "http://localhost:3000")), true);
  assert.equal(proxy.validMutationOrigin(request("/api/profile", "PUT", "http://localhost:3001")), false);
});
