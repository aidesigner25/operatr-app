import { randomBytes, randomUUID, randomInt, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { createSupabaseRotationStore } from "./credential-rotation-supabase.mjs";
import { rotateCredentials } from "./credential-rotation-core.mjs";

function origin(value) {
  const url = new URL(value);
  // Require canonical Supabase URLs to avoid different aliases for the same project.
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/") throw new Error("Use the canonical HTTPS project URL from Supabase.");
  return url.origin;
}

/** Test-only. Random fake credentials and keys are held only in memory. */
export async function runIsolatedRotationTest({ stagingUrl, appUrl, stagingSecret, stagingPublishable, request = fetch, log = console.log }) {
  const stage = origin(stagingUrl);
  if (stage === origin(appUrl)) throw new Error("STOP: The test project matches your configured Operatr project.");
  if (!stagingSecret || !stagingPublishable) throw new Error("Test-project API keys are required.");
  const privilegedHeaders = { apikey: stagingSecret, ...(stagingSecret.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${stagingSecret}` }) };
  async function api(path, options = {}, headers = privilegedHeaders) {
    let response;
    try { response = await request(new URL(path, stage), { ...options, headers: { ...headers, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }, signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store" }); }
    catch { throw new Error("Test-project request failed. Its outcome may be unknown."); }
    return { status: response.status, ok: response.ok, body: await response.json().catch(() => null), headers: response.headers };
  }
  const env = { OPERATR_KEY_ENCRYPTION_KEY_ID: "lab-old", secret: randomBytes(32).toString("base64url") };
  const previous = env.secret;
  const modules = { "server-only": {}, "node:crypto": { createCipheriv, createDecipheriv, randomBytes }, "@/lib/server/env": { assertCredentialVaultConfiguration() {}, getServerEnvironment: () => ({ encryptionSecret: env.secret }) } };
  const code = ts.transpileModule(await readFile(new URL("../src/lib/server/vault.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: (id) => modules[id], process: { env }, Buffer };
  vm.runInNewContext(code, context);
  const vault = context.exports;
  const marker = await api("/rest/v1/operatr_rotation_lab_marker?select=marker&marker=eq.operatr-rotation-lab-only-v1");
  if (!marker.ok || !Array.isArray(marker.body) || marker.body.length !== 1 || marker.body[0].marker !== "operatr-rotation-lab-only-v1") throw new Error("STOP: The disposable rotation lab is not initialized in that project.");
  const denied = await api("/rest/v1/rpc/operatr_rotation_role_check", { method: "POST", body: "{}" }, { apikey: stagingPublishable });
  if (![401, 403, 404].includes(denied.status)) throw new Error("FAIL or INCONCLUSIVE: the public key was not blocked from the maintenance function.");
  log("PASS: public test-project key cannot invoke the maintenance function");
  const store = await createSupabaseRotationStore({ projectUrl: stage, maintenanceKey: stagingSecret, allowWrites: true, request });
  if ((await store.scan("vault_credentials", null, 100)).length || (await store.scan("google_workspace_connections", null, 100)).length) throw new Error("STOP: The disposable test tables are not empty; no test records were created.");
  const user = randomUUID(), id = randomUUID();
  const providerOld = vault.encryptCredential("lab-provider-dummy", user, "openai");
  const providerConcurrent = vault.encryptCredential("lab-provider-after-change", user, "openai");
  const googleOld = vault.encryptCredential("lab-google-dummy", user, "google_workspace");
  env.OPERATR_KEY_ENCRYPTION_KEY_ID = "lab-new";
  env.OPERATR_KEY_ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({ "lab-old": previous });
  env.secret = randomBytes(32).toString("base64url");
  const pathVault = `/rest/v1/vault_credentials?id=eq.${id}`;
  const pathGoogle = `/rest/v1/google_workspace_connections?user_id=eq.${user}`;
  let started = false, success = false, activeHolder = null;
  try {
    started = true;
    const a = await api("/rest/v1/vault_credentials", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id, user_id: user, provider: "openai", encrypted_credential: providerOld.ciphertext, key_id: providerOld.keyId, encryption_version: 1, last_four: "ummy" }) });
    if (!a.ok || !Array.isArray(a.body) || a.body.length !== 1) throw new Error("INCONCLUSIVE: could not create synthetic provider fixture.");
    const b = await api("/rest/v1/google_workspace_connections", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: user, encrypted_refresh_token: googleOld.ciphertext }) });
    if (!b.ok || !Array.isArray(b.body) || b.body.length !== 1) throw new Error("INCONCLUSIVE: could not create synthetic Workspace fixture.");
    const snapshot = { vault: (await store.scan("vault_credentials", null, 100))[0], google: (await store.scan("google_workspace_connections", null, 100))[0] };
    const preview = await rotateCredentials({ store, vault, activeKeyId: "lab-new" });
    if (preview.scanned !== 2 || preview.requiresRotation !== 2 || preview.rotated !== 0) throw new Error("FAIL: unexpected dry-run result.");
    log("PASS: real Data API dry run found both synthetic credentials");
    const changed = await api(pathVault, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ encrypted_credential: providerConcurrent.ciphertext }) });
    if (!changed.ok || !Array.isArray(changed.body) || changed.body.length !== 1) throw new Error("INCONCLUSIVE: could not prepare a synthetic conflict.");
    const attempted = vault.encryptCredential("lab-provider-dummy", user, "openai");
    const staleResult = await store.compareAndSwap("vault_credentials", snapshot.vault, { encrypted_credential: attempted.ciphertext, key_id: attempted.keyId, encryption_version: 1 });
    if (staleResult !== false) throw new Error("FAIL: stale update was accepted.");
    log("PASS: real Data API rejected a stale synthetic update");
    const applied = await rotateCredentials({ store, vault, activeKeyId: "lab-new", apply: true });
    if (applied.rotated !== 2) throw new Error("FAIL or INCONCLUSIVE: unexpected rotation count.");
    const rotatedVault = (await store.scan("vault_credentials", null, 100))[0];
    const rotatedGoogle = (await store.scan("google_workspace_connections", null, 100))[0];
    if (vault.decryptCredential(rotatedVault.encrypted_credential, user, "openai") !== "lab-provider-after-change" || vault.decryptCredential(rotatedGoogle.encrypted_refresh_token, user, "google_workspace") !== "lab-google-dummy") throw new Error("FAIL: rotated test credentials did not match.");
    const verify = await rotateCredentials({ store, vault, activeKeyId: "lab-new" });
    if (verify.scanned !== 2 || verify.requiresRotation !== 0) throw new Error("FAIL: post-rotation verification did not complete.");
    log("PASS: real Data API rotated and verified both synthetic credentials");

    // Test-only RPC holds the fixture row and signals when its lock is active.
    // Launch both compare-and-swap requests before the holder releases it.
    const lockKey = randomInt(1, 2_147_483_647);
    let holderDone = false;
    activeHolder = api("/rest/v1/rpc/operatr_lab_hold_rotation_row", { method: "POST", body: JSON.stringify({ p_id: id, p_lock_key: lockKey }) })
      .then((value) => { holderDone = true; return value; }, () => { holderDone = true; return null; });
    let held = false;
    for (let attempt = 0; attempt < 25 && !holderDone; attempt++) {
      const probe = await api("/rest/v1/rpc/operatr_lab_rotation_lock_held", { method: "POST", body: JSON.stringify({ p_lock_key: lockKey }) });
      if (!probe.ok || typeof probe.body !== "boolean") throw new Error("INCONCLUSIVE: concurrency lab helpers are unavailable.");
      if (probe.body) { held = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!held || holderDone) throw new Error("INCONCLUSIVE: test-row lock was not observed.");
    const rivalA = vault.encryptCredential("lab-provider-race-a", user, "openai");
    const rivalB = vault.encryptCredential("lab-provider-race-b", user, "openai");
    const replacement = (value) => ({ encrypted_credential: value.ciphertext, key_id: value.keyId, encryption_version: value.encryptionVersion });
    let firstSettled = false, secondSettled = false;
    const first = store.compareAndSwap("vault_credentials", rotatedVault, replacement(rivalA)).then((value) => { firstSettled = true; return { value }; }, () => { firstSettled = true; return { error: true }; });
    const second = store.compareAndSwap("vault_credentials", rotatedVault, replacement(rivalB)).then((value) => { secondSettled = true; return { value }; }, () => { secondSettled = true; return { error: true }; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const stillHeld = await api("/rest/v1/rpc/operatr_lab_rotation_lock_held", { method: "POST", body: JSON.stringify({ p_lock_key: lockKey }) });
    if (!stillHeld.ok || stillHeld.body !== true || holderDone || firstSettled || secondSettled) throw new Error("INCONCLUSIVE: competing requests were not observed during the held-row window.");
    const [outcomeA, outcomeB, holderResult] = await Promise.all([first, second, activeHolder]);
    activeHolder = null;
    if (!holderResult?.ok || holderResult.body !== true || outcomeA.error || outcomeB.error) throw new Error("INCONCLUSIVE: a concurrency request failed.");
    if ([outcomeA.value, outcomeB.value].filter((value) => value === true).length !== 1 || [outcomeA.value, outcomeB.value].filter((value) => value === false).length !== 1) throw new Error("FAIL: concurrent updates did not produce exactly one winner.");
    const winner = (await store.scan("vault_credentials", null, 100))[0];
    const plaintext = vault.decryptCredential(winner.encrypted_credential, user, "openai");
    if (plaintext !== (outcomeA.value ? "lab-provider-race-a" : "lab-provider-race-b")) throw new Error("FAIL: concurrent update winner did not match the stored record.");
    log("PASS: competing Data API updates produced one winner while the test row was locked");
    // This is a small in-memory data snapshot reinserted into test tables, not
    // a database backup or an actual disaster-recovery restore.
    for (const path of [pathVault, pathGoogle]) { const deleted = await api(path, { method: "DELETE" }); if (!deleted.ok) throw new Error("INCONCLUSIVE: synthetic snapshot test deletion failed."); }
    const restoreA = await api("/rest/v1/vault_credentials", { method: "POST", body: JSON.stringify({ ...snapshot.vault, last_four: "ummy" }) });
    const restoreB = await api("/rest/v1/google_workspace_connections", { method: "POST", body: JSON.stringify(snapshot.google) });
    if (!restoreA.ok || !restoreB.ok) throw new Error("INCONCLUSIVE: synthetic snapshot reinsertion failed.");
    const oldAgain = await rotateCredentials({ store, vault, activeKeyId: "lab-new" });
    if (oldAgain.requiresRotation !== 2) throw new Error("FAIL: synthetic old-key snapshot was not readable.");
    log("PASS: a synthetic old-key data snapshot was reinserted and verified");
    success = true;
  } catch (error) {
    log(error instanceof Error && /^(FAIL|INCONCLUSIVE):/.test(error.message) ? error.message : "INCONCLUSIVE: isolated test could not complete.");
  } finally {
    // Do not delete the fixture while the separate holder transaction is live.
    if (activeHolder) await activeHolder;
    if (started) {
      let clean = true;
      for (const path of [pathVault, pathGoogle]) {
        try {
          const removed = await api(path, { method: "DELETE" });
          const remaining = await api(`${path}&select=user_id`);
          if (!removed.ok || !remaining.ok || !Array.isArray(remaining.body) || remaining.body.length !== 0) clean = false;
        } catch { clean = false; }
      }
      if (clean) log("PASS: synthetic test records removed");
      else { success = false; log("CLEANUP NEEDED: inspect only the disposable test project for synthetic rows."); }
    }
  }
  if (!success) throw new Error("Isolated rotation test did not complete successfully.");
}
