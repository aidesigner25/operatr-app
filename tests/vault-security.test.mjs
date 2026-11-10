import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

function setup() {
  const secret = crypto.randomBytes(32).toString("base64url");
  const env = { OPERATR_KEY_ENCRYPTION_KEY_ID: "test-v1" };
  const modules = {
    "server-only": {},
    "node:crypto": crypto,
    "@/lib/server/env": { assertCredentialVaultConfiguration() {}, getServerEnvironment: () => ({ encryptionSecret: env.TEST_SECRET || secret }) },
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/server/vault.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => modules[id], process: { env }, Buffer };
  vm.runInNewContext(code, context);
  return { vault: context.exports, env, secret };
}

test("vault encrypts credentials and binds ciphertext to user and provider", () => {
  const { vault } = setup();
  const first = vault.encryptCredential("dummy-credential-only", "user-a", "openai");
  const second = vault.encryptCredential("dummy-credential-only", "user-a", "openai");
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.doesNotMatch(first.ciphertext, /dummy-credential-only/);
  assert.equal(vault.decryptCredential(first.ciphertext, "user-a", "openai"), "dummy-credential-only");
  assert.throws(() => vault.decryptCredential(first.ciphertext, "user-b", "openai"));
  assert.throws(() => vault.decryptCredential(first.ciphertext, "user-a", "google"));
  assert.throws(() => vault.decryptCredential(first.ciphertext, "user-a", "google_workspace"));
});

test("rotation reads old keys and re-encrypts under the new key without mixing owners or purposes", () => {
  const { vault, env, secret } = setup();
  const original = vault.encryptCredential("dummy-token-for-rotation", "user-a", "google_workspace");
  env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({ "test-v1": secret });
  env.OPERATR_KEY_ENCRYPTION_KEY_ID = "test-v2";
  env.TEST_SECRET = crypto.randomBytes(32).toString("base64url");
  assert.equal(vault.decryptCredential(original.ciphertext, "user-a", "google_workspace"), "dummy-token-for-rotation");
  assert.throws(() => vault.decryptCredential(original.ciphertext, "user-b", "google_workspace"));
  const rotated = vault.reencryptCredential(original.ciphertext, "user-a", "google_workspace");
  assert.equal(rotated.keyId, "test-v2");
  delete env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS;
  assert.equal(vault.decryptCredential(rotated.ciphertext, "user-a", "google_workspace"), "dummy-token-for-rotation");
  assert.throws(() => vault.decryptCredential(original.ciphertext, "user-a", "google_workspace"), /unavailable/);
});

test("rotation rejects malformed keyrings and invalid old key lengths", () => {
  const { vault, env } = setup();
  const encrypted = vault.encryptCredential("dummy-token-for-rotation", "user-a", "openai");
  env.OPERATR_KEY_ENCRYPTION_KEY_ID = "test-v2";
  env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS = "not-json";
  assert.throws(() => vault.decryptCredential(encrypted.ciphertext, "user-a", "openai"));
  env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({ "test-v1": "invalid" });
  assert.throws(() => vault.decryptCredential(encrypted.ciphertext, "user-a", "openai"));
});

test("vault rejects tampered ciphertext and unavailable key IDs", () => {
  const { vault, env } = setup();
  const encrypted = vault.encryptCredential("dummy-credential-only", "user-a", "openai");
  const parts = encrypted.ciphertext.split(".");
  const bytes = Buffer.from(parts[4], "base64url");
  bytes[0] ^= 1;
  parts[4] = bytes.toString("base64url");
  assert.throws(() => vault.decryptCredential(parts.join("."), "user-a", "openai"));
  env.OPERATR_KEY_ENCRYPTION_KEY_ID = "test-v2";
  assert.throws(() => vault.decryptCredential(encrypted.ciphertext, "user-a", "openai"), /unavailable/);
});
