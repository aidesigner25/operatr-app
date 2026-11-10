import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { runRotationPreflight, validatePreflightArguments } from "../scripts/credential-rotation-preflight.mjs";

const vault = {
  isCredentialProvider: (provider) => provider === "openai",
  encryptCredential: () => ({ ciphertext: "v1.new.iv.tag.data", keyId: "new", encryptionVersion: 1 }),
  decryptCredential: (_ciphertext, user) => user === "rotation-probe-user" ? "operatr-rotation-probe" : "synthetic-only",
};
test("operator preflight requests a read-only store and does not write", async () => {
  let options, writes = 0;
  const createStore = async (value) => { options = value; return {
    scan: async (table) => table === "vault_credentials" ? [{ id: "1", user_id: "a", provider: "openai", encrypted_credential: "v1.old.iv.tag.data", key_id: "old", encryption_version: 1, updated_at: "date" }] : [],
    compareAndSwap: async () => { writes++; throw new Error("must not write"); },
  }; };
  const result = await runRotationPreflight({ projectUrl: "https://test.example", maintenanceKey: "secret-for-test", activeKeyId: "new", vault, createStore });
  assert.equal(options.allowWrites, false);
  assert.equal(result.mode, "dry-run");
  assert.equal(result.requiresRotation, 1);
  assert.equal(writes, 0);
  assert.doesNotMatch(JSON.stringify(result), /secret-for-test|synthetic-only/);
});
test("operator rejects every argument including apply before requesting credentials", async () => {
  assert.doesNotThrow(() => validatePreflightArguments([]));
  assert.throws(() => validatePreflightArguments(["--apply"]), /cannot perform rotation writes/);
  const run = promisify(execFile);
  await assert.rejects(run(process.execPath, [new URL("../scripts/credential-rotation-preflight.mjs", import.meta.url).pathname, "--apply"]), (error) => /cannot perform rotation writes/.test(error.stderr) && !/Maintenance key/.test(error.stderr));
});
