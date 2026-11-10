import { randomUUID } from "node:crypto";
import { checkRuntimeDataApi } from "./check-data-api-runtime.mjs";
import readline from "node:readline";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// All data created by this script is synthetic. Tokens and passwords remain in
// memory, are not logged, and are never passed to Operatr or an AI provider.
function terminal() {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return {
    ask(label, secret = false) {
      return new Promise((resolve) => {
        process.stdout.write(label);
        muted = secret;
        rl.question("", (answer) => { muted = false; if (secret) process.stdout.write("\n"); resolve(answer); });
      });
    },
    close() { rl.close(); },
  };
}

export async function runDataApiChecks({ baseUrl, publishableKey, accounts, request = fetch, log = console.log, runtimeChecks = false }) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Invalid Supabase project URL.");
  if (accounts.length !== 2 || accounts[0].id === accounts[1].id) throw new Error("Two different accounts are required.");
  const created = [];
  let failed = false;
  let runtimeRows = [];
  async function api(path, token, options = {}) {
    const response = await request(new URL(path, base), { ...options, headers: { apikey: publishableKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }, signal: AbortSignal.timeout(15000), redirect: "error" });
    const body = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body };
  }
  function requireRows(result, count, description) {
    if (!result.ok || !Array.isArray(result.body) || result.body.length !== count) throw new Error(description);
  }
  const path = (id) => `/rest/v1/chat_conversations?id=eq.${encodeURIComponent(id)}&select=id,title`;
  try {
    for (const account of accounts) {
      const id = randomUUID();
      // Track before the request: an uncertain response still needs cleanup.
      created.push({ account, id });
      const response = await api("/rest/v1/chat_conversations?select=id", account.token, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id, user_id: account.id, title: "Operatr RLS synthetic test", provider: "openai", model: "test-model", response_style: "medium" }) });
      requireRows(response, 1, "INCONCLUSIVE: could not create an owned synthetic conversation.");
    }
    for (let i = 0; i < 2; i++) {
      const own = created[i]; const other = created[1 - i];
      requireRows(await api(path(own.id), own.account.token), 1, `INCONCLUSIVE: account ${i + 1} cannot read its own fixture.`);
      const ownUpdate = await api(path(own.id), own.account.token, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title: `Operatr RLS owner ${i + 1}` }) });
      requireRows(ownUpdate, 1, `INCONCLUSIVE: account ${i + 1} cannot update its own fixture.`);
      requireRows(await api(path(other.id), own.account.token), 0, `FAIL or INCONCLUSIVE: account ${i + 1} cross-account read was not an empty successful response.`);
      requireRows(await api(path(other.id), own.account.token, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title: "Operatr RLS forbidden update" }) }), 0, `FAIL or INCONCLUSIVE: account ${i + 1} cross-account update was not an empty successful response.`);
      requireRows(await api(path(other.id), own.account.token, { method: "DELETE", headers: { Prefer: "return=representation" } }), 0, `FAIL or INCONCLUSIVE: account ${i + 1} cross-account delete was not an empty successful response.`);
      const forgedId = randomUUID();
      // If the defense fails or the request times out after insertion, the
      // intended owner can still remove this synthetic record during cleanup.
      created.push({ account: other.account, id: forgedId });
      const forged = await api("/rest/v1/chat_conversations", own.account.token, { method: "POST", body: JSON.stringify({ id: forgedId, user_id: other.account.id, title: "Operatr RLS forbidden insert", provider: "openai", model: "test-model", response_style: "medium" }) });
      if (forged.ok) throw new Error(`FAIL: account ${i + 1} inserted a record for another owner; an unexpected synthetic record may remain.`);
      if (forged.body?.code !== "42501" || ![401, 403].includes(forged.status)) throw new Error(`INCONCLUSIVE: account ${i + 1} forbidden insert returned an unexpected error.`);
      log(`PASS: account ${i + 1} own read/update and cross-account read/update/delete/insert`);
    }
    if (runtimeChecks) runtimeRows = await checkRuntimeDataApi({ api, conversations: created.slice(0, 2), log });
    const anonymous = await api(path(created[0].id), null);
    if (anonymous.ok && Array.isArray(anonymous.body) && anonymous.body.length === 0) log("PASS: anonymous request saw no synthetic conversation");
    else if ([401, 403].includes(anonymous.status)) log("PASS: anonymous request blocked by API or database grant");
    else throw new Error("FAIL or INCONCLUSIVE: anonymous response was not an empty result or access denial.");
    // Ensure neither cross-account update nor delete affected either fixture.
    for (let i = 0; i < 2; i++) {
      const result = await api(path(created[i].id), created[i].account.token);
      requireRows(result, 1, `FAIL or INCONCLUSIVE: owner ${i + 1} fixture missing after cross-account checks.`);
      if (result.body[0].title !== `Operatr RLS owner ${i + 1}`) throw new Error(`FAIL: owner ${i + 1} fixture was changed by another account.`);
    }
  } catch (error) {
    failed = true;
    log(error instanceof Error ? error.message : "INCONCLUSIVE: test failed unexpectedly.");
  } finally {
    for (const item of created) {
      try {
        const result = await api(path(item.id), item.account.token, { method: "DELETE", headers: { Prefer: "return=representation" } });
        if (!result.ok || !Array.isArray(result.body) || result.body.length > 1) throw new Error();
        const verification = await api(path(item.id), item.account.token);
        requireRows(verification, 0, "cleanup");
      } catch {
        failed = true;
        log(`CLEANUP NEEDED: synthetic conversation ${item.id}; delete it through its owner's Operatr account.`);
      }
    }
  }
  if (!failed && runtimeChecks) {
    try {
      for (const row of runtimeRows) requireRows(await api(row.path, row.token), 0, `cleanup: ${row.table}`);
      log("PASS: synthetic runtime record cleanup verified");
    } catch { failed = true; log("CLEANUP NEEDED: a synthetic runtime record may remain; investigate before retrying."); }
  }
  if (failed) throw new Error("One or more checks were not successful.");
  log("PASS: synthetic conversation cleanup verified");
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run this test in an interactive terminal.");
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!baseUrl || !publishableKey) throw new Error("Supabase URL and publishable key must be configured in .env.local.");
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Invalid Supabase project URL.");
  const cli = terminal();
  const accounts = [];
  try {
    for (let i = 1; i <= 2; i++) {
      const email = (await cli.ask(`Test account ${i} email: `)).trim();
      const password = await cli.ask(`Test account ${i} password (hidden): `, true);
      const response = await fetch(new URL("/auth/v1/token?grant_type=password", base), { method: "POST", headers: { apikey: publishableKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000), redirect: "error" });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.access_token !== "string" || typeof body?.user?.id !== "string") throw new Error(`Could not sign in test account ${i}. Check its credentials and authentication settings.`);
      accounts.push({ token: body.access_token, id: body.user.id });
    }
  } finally { cli.close(); }
  await runDataApiChecks({ baseUrl, publishableKey, accounts, runtimeChecks: process.argv.includes("--runtime") });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Test unavailable."); process.exitCode = 1; });
}
