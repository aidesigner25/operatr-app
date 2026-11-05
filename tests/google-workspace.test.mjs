import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

function load(environment = {}) {
  const source = readFileSync(new URL("../src/lib/server/google-workspace.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => id === "node:crypto" ? crypto : {}, process: { env: environment }, Buffer, URL, URLSearchParams, Date, AbortSignal, fetch };
  vm.runInNewContext(code, context);
  return context.exports;
}
const config = { GOOGLE_OAUTH_CLIENT_ID: "client", GOOGLE_OAUTH_CLIENT_SECRET: "secret", GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/google-workspace/callback", NEXT_PUBLIC_APP_URL: "http://localhost:3000" };

test("OAuth uses a bound state, offline access and PKCE", () => {
  const api = load(config);
  const flow = api.createGoogleAuthorization("user-a", api.googleConfig());
  const url = new URL(flow.url);
  const state = url.searchParams.get("state");
  const verifier = api.validateGoogleState(flow.cookie, state, "user-a", api.googleConfig());
  assert.ok(verifier);
  assert.equal(url.searchParams.get("code_challenge"), crypto.createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("scope"), api.GOOGLE_SCOPE);
  assert.equal(api.validateGoogleState(flow.cookie, state, "user-b", api.googleConfig()), null);
  assert.equal(api.validateGoogleState(flow.cookie, "wrong", "user-a", api.googleConfig()), null);
  const decoded = JSON.parse(Buffer.from(flow.cookie.split(".")[0], "base64url").toString());
  decoded.expires = Date.now() - 1000;
  const payload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  const signature = crypto.createHmac("sha256", "secret").update(payload).digest("base64url");
  assert.equal(api.validateGoogleState(`${payload}.${signature}`, state, "user-a", api.googleConfig()), null);
  assert.equal(api.validateGoogleState(`${payload}.${flow.cookie.split(".")[1]}`, state, "user-a", api.googleConfig()), null);
});

test("OAuth requires matching origins, callback path and HTTPS outside localhost", () => {
  const api = load(config);
  assert.ok(api.googleConfig());
  assert.equal(api.sameOrigin(new Request("http://localhost:3000", { headers: { Origin: "http://localhost:3000" } }), api.googleConfig()), true);
  assert.equal(api.sameOrigin(new Request("http://localhost:3000", { headers: { Origin: "https://attacker.example" } }), api.googleConfig()), false);
  assert.equal(load({ ...config, GOOGLE_OAUTH_REDIRECT_URI: "https://attacker.example/api/google-workspace/callback" }).googleConfig(), null);
  assert.equal(load({ ...config, NEXT_PUBLIC_APP_URL: "http://example.com", GOOGLE_OAUTH_REDIRECT_URI: "http://example.com/api/google-workspace/callback" }).googleConfig(), null);
});
