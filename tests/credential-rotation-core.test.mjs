import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { rotateCredentials } from "../scripts/credential-rotation-core.mjs";
import { createSupabaseRotationStore } from "../scripts/credential-rotation-supabase.mjs";

function setup() {
  const oldSecret = crypto.randomBytes(32).toString("base64url");
  const env = { OPERATR_KEY_ENCRYPTION_KEY_ID: "old", TEST_SECRET: oldSecret };
  const modules = { "server-only": {}, "node:crypto": crypto, "@/lib/server/env": { assertCredentialVaultConfiguration() {}, getServerEnvironment: () => ({ encryptionSecret: env.TEST_SECRET }) } };
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/server/vault.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => modules[id], process: { env }, Buffer };
  vm.runInNewContext(code, context);
  const vault = context.exports;
  const encryptedA = vault.encryptCredential("dummy-provider-secret", "user-a", "openai");
  const encryptedB = vault.encryptCredential("dummy-workspace-token", "user-b", "google_workspace");
  const db = {
    vault_credentials: [{ id: "row-a", user_id: "user-a", provider: "openai", encrypted_credential: encryptedA.ciphertext, key_id: "old", encryption_version: 1, updated_at: "v1" }],
    google_workspace_connections: [{ user_id: "user-b", encrypted_refresh_token: encryptedB.ciphertext, updated_at: "v1" }],
  };
  env.OPERATR_KEY_ENCRYPTION_KEY_ID = "new";
  env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({ old: oldSecret });
  env.TEST_SECRET = crypto.randomBytes(32).toString("base64url");
  let writes = 0;
  const store = {
    async scan(table, cursor, limit) { return db[table].filter((row) => cursor === null || (table === "vault_credentials" ? row.id : row.user_id) > cursor).slice(0, limit).map((row) => ({ ...row })); },
    async compareAndSwap(table, row, replacement) {
      writes++;
      const current = db[table].find((item) => table === "vault_credentials" ? item.id === row.id : item.user_id === row.user_id);
      if (!current || current.updated_at !== row.updated_at) return false;
      Object.assign(current, replacement, { updated_at: "v2" });
      return true;
    },
  };
  return { vault, db, env, store, writes: () => writes };
}

test("preflight scans both credential types without storage writes", async () => {
  const { vault, db, store, writes } = setup();
  const before = JSON.stringify(db);
  const result = await rotateCredentials({ store, vault, activeKeyId: "new" });
  assert.deepEqual(result, { mode: "dry-run", scanned: 2, current: 0, requiresRotation: 2, rotated: 0 });
  assert.equal(writes(), 0);
  assert.equal(JSON.stringify(db), before);
  assert.doesNotMatch(JSON.stringify(result), /dummy-/);
});

test("guarded rotation preserves plaintext and is idempotent", async () => {
  const { vault, db, store, env } = setup();
  const result = await rotateCredentials({ store, vault, activeKeyId: "new", apply: true });
  assert.equal(result.rotated, 2);
  assert.equal(db.vault_credentials[0].key_id, "new");
  delete env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS;
  assert.equal(vault.decryptCredential(db.vault_credentials[0].encrypted_credential, "user-a", "openai"), "dummy-provider-secret");
  assert.equal(vault.decryptCredential(db.google_workspace_connections[0].encrypted_refresh_token, "user-b", "google_workspace"), "dummy-workspace-token");
  assert.equal((await rotateCredentials({ store, vault, activeKeyId: "new", apply: true })).rotated, 0);
});

test("unreadable or inconsistent records fail preflight before any writes", async () => {
  const { vault, db, store, writes } = setup();
  db.google_workspace_connections[0].encrypted_refresh_token = "v1.missing.invalid.invalid.invalid";
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "new", apply: true }), (error) => error.code === "unreadable_record");
  assert.equal(writes(), 0);
});

test("concurrent change halts without overwriting the changed credential", async () => {
  const { vault, db, store } = setup();
  const before = db.vault_credentials[0].encrypted_credential;
  store.compareAndSwap = async () => false;
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "new", apply: true }), (error) => error.code === "concurrent_change" && error.rotated === 0);
  assert.equal(db.vault_credentials[0].encrypted_credential, before);
});

test("partial migration is reported and an incomplete traversal is rejected", async () => {
  const { vault, store } = setup();
  const write = store.compareAndSwap;
  store.compareAndSwap = async (table, row, replacement) => table === "google_workspace_connections" ? false : write(table, row, replacement);
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "new", apply: true }), (error) => error.code === "concurrent_change" && error.rotated === 1);
  await assert.rejects(rotateCredentials({ store: { scan: async () => Array(101).fill({}) }, vault, activeKeyId: "new" }), (error) => error.code === "invalid_page");
});

test("rejects an active key ID that does not match the encryption configuration", async () => {
  const { vault, store, writes } = setup();
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "wrong", apply: true }), (error) => error.code === "invalid_configuration");
  assert.equal(writes(), 0);
});

test("preflight reads every page, including records after the first hundred", async () => {
  const { vault, db, store } = setup();
  const sample = db.vault_credentials[0];
  db.vault_credentials = Array.from({ length: 105 }, (_, i) => ({ ...sample, id: `row-${String(i).padStart(3, "0")}` }));
  const result = await rotateCredentials({ store, vault, activeKeyId: "new" });
  assert.equal(result.scanned, 106);
  assert.equal(result.requiresRotation, 106);
});

test("a partially completed migration can be retried with both keys available", async () => {
  const { vault, store } = setup();
  const update = store.compareAndSwap;
  store.compareAndSwap = async (table, row, replacement) => table === "google_workspace_connections" ? false : update(table, row, replacement);
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "new", apply: true }), (error) => error.rotated === 1);
  store.compareAndSwap = update;
  const resumed = await rotateCredentials({ store, vault, activeKeyId: "new", apply: true });
  assert.equal(resumed.current, 1);
  assert.equal(resumed.rotated, 1);
});

test("storage failures report partial progress without exposing backend errors", async () => {
  const { vault, store } = setup();
  const update = store.compareAndSwap;
  store.compareAndSwap = async (table, row, replacement) => {
    if (table === "google_workspace_connections") throw new Error("sensitive-backend-message");
    return update(table, row, replacement);
  };
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "new", apply: true }), (error) => error.code === "update_failed" && error.rotated === 1 && !error.message.includes("sensitive-backend-message"));
});

test("rotation core and maintenance adapter coordinate a simulated migration", async () => {
  const { vault, db } = setup();
  const request = async (url, init) => {
    if (url.pathname.endsWith("operatr_rotation_role_check")) return Response.json(true);
    if (url.pathname.endsWith("operatr_rotate_vault_credential")) {
      const p = JSON.parse(init.body); const row = db.vault_credentials[0];
      const matches = row.id === p.p_id && row.user_id === p.p_user_id && row.provider === p.p_provider && row.updated_at === p.p_updated_at && row.encrypted_credential === p.p_old_ciphertext && row.key_id === p.p_old_key_id && row.encryption_version === p.p_old_version;
      if (matches) Object.assign(row, { encrypted_credential: p.p_new_ciphertext, key_id: p.p_new_key_id, encryption_version: p.p_new_version, updated_at: "v2" });
      return Response.json(matches);
    }
    if (url.pathname.endsWith("operatr_rotate_google_connection")) {
      const p = JSON.parse(init.body); const row = db.google_workspace_connections[0];
      const matches = row.user_id === p.p_user_id && row.updated_at === p.p_updated_at && row.encrypted_refresh_token === p.p_old_ciphertext;
      if (matches) Object.assign(row, { encrypted_refresh_token: p.p_new_ciphertext, updated_at: "v2" });
      return Response.json(matches);
    }
    const table = url.pathname.split("/").pop();
    const rows = db[table];
    return Response.json(rows, { headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" } });
  };
  const store = await createSupabaseRotationStore({ projectUrl: "https://project.supabase.co", maintenanceKey: "sb_secret_dummy", allowWrites: true, request });
  assert.equal((await rotateCredentials({ store, vault, activeKeyId: "new" })).requiresRotation, 2);
  assert.equal((await rotateCredentials({ store, vault, activeKeyId: "new", apply: true })).rotated, 2);
  assert.equal((await rotateCredentials({ store, vault, activeKeyId: "new" })).requiresRotation, 0);
});

test("simulated restore of pre-rotation data requires the retained historical key", async () => {
  const { vault, db, store, env } = setup();
  const snapshot = structuredClone(db); // In-memory simulation; not a database backup.
  const historicalKeys = env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS;
  await rotateCredentials({ store, vault, activeKeyId: "new", apply: true });
  db.vault_credentials = structuredClone(snapshot.vault_credentials);
  db.google_workspace_connections = structuredClone(snapshot.google_workspace_connections);
  delete env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS;
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "new" }), (error) => error.code === "unreadable_record");
  env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS = historicalKeys;
  const restored = await rotateCredentials({ store, vault, activeKeyId: "new" });
  assert.equal(restored.requiresRotation, 2);
  assert.equal(vault.decryptCredential(db.vault_credentials[0].encrypted_credential, "user-a", "openai"), "dummy-provider-secret");
  assert.equal(vault.decryptCredential(db.google_workspace_connections[0].encrypted_refresh_token, "user-b", "google_workspace"), "dummy-workspace-token");
});

test("an update that commits but times out is reconciled on the next dry run", async () => {
  const { vault, db, store } = setup();
  const original = store.compareAndSwap;
  let timedOut = false;
  store.compareAndSwap = async (table, row, replacement) => {
    const applied = await original(table, row, replacement);
    if (!timedOut) { timedOut = true; throw new Error("simulated timeout after commit"); }
    return applied;
  };
  await assert.rejects(rotateCredentials({ store, vault, activeKeyId: "new", apply: true }), (error) => error.code === "update_failed" && error.rotated === 0);
  assert.equal(db.vault_credentials[0].key_id, "new");
  const after = await rotateCredentials({ store, vault, activeKeyId: "new" });
  assert.equal(after.current, 1);
  assert.equal(after.requiresRotation, 1);
});
