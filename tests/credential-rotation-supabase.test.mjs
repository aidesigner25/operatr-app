import assert from "node:assert/strict";
import { test } from "node:test";
import { createSupabaseRotationStore } from "../scripts/credential-rotation-supabase.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const original = { id, user_id: id, provider: "openai", updated_at: "2026-01-01T00:00:00+00:00", encrypted_credential: "v1.old.iv.tag.cipher", key_id: "old", encryption_version: 1 };
const replacement = { encrypted_credential: "v1.new.iv.tag.other", key_id: "new", encryption_version: 1 };
function backend({ role = true, range = "0-0/1", rows = [original], rpcResult = true } = {}) {
  const calls = [];
  async function request(url, init) {
    calls.push({ url, init });
    if (url.pathname.endsWith("operatr_rotation_role_check")) return Response.json(role);
    if (url.pathname.includes("/rpc/")) return Response.json(rpcResult);
    return Response.json(rows, { headers: { "content-range": range } });
  }
  return { calls, request };
}
test("adapter checks privileged role, uses keyset pages, and is read-only by default", async () => {
  const mock = backend();
  const store = await createSupabaseRotationStore({ projectUrl: "https://project.supabase.co", maintenanceKey: "sb_secret_dummy", request: mock.request });
  assert.equal((await store.scan("vault_credentials", null, 100)).length, 1);
  assert.equal(mock.calls[1].init.headers.Prefer, "count=exact");
  assert.equal(mock.calls[0].init.headers.Authorization, undefined);
  assert.equal(mock.calls[0].init.headers.apikey, "sb_secret_dummy");
  assert.equal(mock.calls[1].url.searchParams.get("order"), "id.asc");
  await assert.rejects(store.compareAndSwap("vault_credentials", original, replacement), /read-only/);
  assert.equal(mock.calls.length, 2);
});
test("adapter sends atomic compare values in the request body, not the URL", async () => {
  const mock = backend({ rpcResult: false });
  const store = await createSupabaseRotationStore({ projectUrl: "https://project.supabase.co", maintenanceKey: "legacy-jwt", request: mock.request, allowWrites: true });
  assert.equal(await store.compareAndSwap("vault_credentials", original, replacement), false);
  const call = mock.calls[1];
  assert.equal(call.init.headers.Authorization, "Bearer legacy-jwt");
  assert.doesNotMatch(call.url.href, /cipher|other|legacy-jwt/);
  const params = JSON.parse(call.init.body);
  assert.equal(params.p_old_ciphertext, original.encrypted_credential);
  assert.equal(params.p_updated_at, original.updated_at);
  assert.equal(params.p_new_ciphertext, replacement.encrypted_credential);
});
test("adapter refuses non-privileged roles, incomplete scans and invalid URLs", async () => {
  await assert.rejects(createSupabaseRotationStore({ projectUrl: "https://project.supabase.co", maintenanceKey: "key", request: backend({ role: false }).request }), /role/);
  await assert.rejects(createSupabaseRotationStore({ projectUrl: "http://project.supabase.co", maintenanceKey: "key", request: backend().request }), /configuration/);
  for (const mock of [backend({ range: "0-0/5" }), backend({ range: "*/0", rows: [original] }), backend({ range: "0-0/*" })]) {
    const store = await createSupabaseRotationStore({ projectUrl: "https://project.supabase.co", maintenanceKey: "key", request: mock.request });
    await assert.rejects(store.scan("vault_credentials", null, 100));
  }
});
test("adapter handles empty pages, cursor filtering, Google records and API failures", async () => {
  const mock = backend({ range: "*/0", rows: [] });
  const store = await createSupabaseRotationStore({ projectUrl: "https://project.supabase.co", maintenanceKey: "key", request: mock.request, allowWrites: true });
  assert.deepEqual(await store.scan("google_workspace_connections", id, 100), []);
  assert.equal(mock.calls[1].url.searchParams.get("user_id"), `gt.${id}`);
  assert.equal(await store.compareAndSwap("google_workspace_connections", { user_id: id, updated_at: "date", encrypted_refresh_token: "old" }, { encrypted_refresh_token: "new" }), true);
  assert.equal(mock.calls[2].url.pathname.endsWith("operatr_rotate_google_connection"), true);
  await assert.rejects(store.scan("not_a_table", null, 100), /Invalid scan/);
  await assert.rejects(store.scan("vault_credentials", "bad-cursor", 100), /Invalid scan/);
});
