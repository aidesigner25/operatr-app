import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRuntimeDataApi } from "../scripts/check-data-api-runtime.mjs";

function fake({ allowCrossDelete = false } = {}) {
  const store = new Map();
  const api = async (path, token, options = {}) => {
    const url = new URL(path, "https://example.com");
    const table = url.pathname.split("/").pop();
    const pk = table === "chat_value_estimates" ? "message_id" : "id";
    const key = url.searchParams.get(pk)?.slice(3);
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      if (body.user_id !== token) return { ok: false, status: 403, body: { code: "42501" } };
      store.set(`${table}:${body[pk]}`, body);
      return { ok: true, status: 201, body: [{ [pk]: body[pk] }] };
    }
    const record = store.get(`${table}:${key}`);
    const allowed = record && (record.user_id === token || (allowCrossDelete && options.method === "DELETE"));
    if (!allowed) return { ok: true, status: 200, body: [] };
    if (options.method === "DELETE") store.delete(`${table}:${key}`);
    return { ok: true, status: 200, body: [{ [pk]: key }] };
  };
  return { api, store };
}
const conversations = [{ id: "chat-a", account: { id: "a", token: "a" } }, { id: "chat-b", account: { id: "b", token: "b" } }];
test("runtime check verifies ownership on all four tables", async () => {
  const { api, store } = fake(); const logs = [];
  const rows = await checkRuntimeDataApi({ api, conversations, log: (value) => logs.push(value) });
  assert.equal(rows.length, 8);
  assert.equal(store.size, 8);
  assert.equal(logs.length, 4);
});
test("runtime check rejects cross-account deletion", async () => {
  const { api } = fake({ allowCrossDelete: true });
  await assert.rejects(checkRuntimeDataApi({ api, conversations, log() {} }), /cross-account.*delete/);
});
