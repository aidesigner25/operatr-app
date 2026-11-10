import { test } from "node:test";
import assert from "node:assert/strict";
import { runDataApiChecks } from "../scripts/check-data-api-isolation.mjs";

function fakeApi({ brokenUpdate = false } = {}) {
  const rows = new Map();
  async function request(url, options) {
    const user = options.headers.Authorization?.replace("Bearer ", "") || null;
    const id = url.searchParams.get("id")?.slice(3);
    const body = options.body ? JSON.parse(options.body) : null;
    if (options.method === "POST") {
      if (body.user_id !== user) return Response.json({ code: "42501" }, { status: 403 });
      rows.set(body.id, { id: body.id, title: body.title, owner: body.user_id });
      return Response.json([{ id: body.id }], { status: 201 });
    }
    const row = rows.get(id);
    const accessible = row && row.owner === user;
    if (options.method === "PATCH") {
      if (row && (accessible || brokenUpdate)) { row.title = body.title; return Response.json([{ id: row.id, title: row.title }]); }
      return Response.json([]);
    }
    if (options.method === "DELETE") {
      if (accessible) { rows.delete(id); return Response.json([{ id }]); }
      return Response.json([]);
    }
    return Response.json(accessible ? [{ id, title: row.title }] : []);
  }
  return { request, rows };
}
const config = { baseUrl: "https://project.supabase.co", publishableKey: "public-key", accounts: [{ id: "a", token: "a" }, { id: "b", token: "b" }] };
test("direct API check verifies both directions and removes synthetic rows", async () => {
  const api = fakeApi(); const logs = [];
  await runDataApiChecks({ ...config, request: api.request, log: (message) => logs.push(message) });
  assert.equal(api.rows.size, 0);
  assert.equal(logs.filter((message) => message.startsWith("PASS:")).length, 4);
});
test("direct API check reports a broken cross-user update and cleans fixtures", async () => {
  const api = fakeApi({ brokenUpdate: true }); const logs = [];
  await assert.rejects(runDataApiChecks({ ...config, request: api.request, log: (message) => logs.push(message) }));
  assert.equal(api.rows.size, 0);
  assert.ok(logs.some((message) => message.includes("cross-account update")));
});

test("runtime mode verifies child cleanup after deleting synthetic parents", async () => {
  const stores = new Map();
  const store = (name) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  const request = async (url, options) => {
    const table = url.pathname.split("/").pop();
    const user = options.headers.Authorization?.replace("Bearer ", "") || null;
    const pk = table === "chat_value_estimates" ? "message_id" : "id";
    const id = url.searchParams.get(pk)?.slice(3);
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      if (body.user_id !== user) return Response.json({ code: "42501" }, { status: 403 });
      store(table).set(body[pk], { ...body });
      return Response.json([{ [pk]: body[pk] }], { status: 201 });
    }
    const row = store(table).get(id);
    if (!row || row.user_id !== user) return Response.json([]);
    if (options.method === "PATCH") Object.assign(row, JSON.parse(options.body));
    if (options.method === "DELETE") {
      store(table).delete(id);
      if (table === "chat_conversations") {
        for (const [name, children] of stores) if (name !== table) for (const [key, child] of children) if (child.user_id === user) children.delete(key);
      }
    }
    return Response.json([{ [pk]: id, title: row.title }]);
  };
  const logs = [];
  await runDataApiChecks({ ...config, request, runtimeChecks: true, log: (message) => logs.push(message) });
  assert.equal(logs.filter((message) => message.startsWith("PASS:")).length, 9);
  assert.equal([...stores.values()].reduce((count, records) => count + records.size, 0), 0);
});
