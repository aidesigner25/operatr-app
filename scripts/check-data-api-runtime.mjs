import { randomUUID } from "node:crypto";

// Runs only against synthetic parent conversations owned by the two test users.
// Parent deletion in the caller removes fixtures by FK cascade.
export async function checkRuntimeDataApi({ api, conversations, log }) {
  const rows = [];
  const fixtures = [0, 1].map(() => ({ message: randomUUID(), run: randomUUID(), event: randomUUID() }));
  const specs = [
    { table: "chat_messages", key: "id", id: (f) => f.message, update: { content: "Operatr RLS owner update" }, build: (f, c) => ({ id: f.message, conversation_id: c.id, user_id: c.account.id, role: "assistant", content: "Operatr RLS fixture", status: "completed" }) },
    { table: "chat_agent_runs", key: "id", id: (f) => f.run, update: { output_characters: 1 }, build: (f, c) => ({ id: f.run, conversation_id: c.id, user_id: c.account.id, provider: "openai", model: "test-model", response_style: "medium", status: "completed", max_output_tokens: 100 }) },
    { table: "chat_agent_run_events", key: "id", id: (f) => f.event, update: { detail: "Operatr RLS owner update" }, build: (f, c) => ({ id: f.event, run_id: f.run, user_id: c.account.id, stage: "completed", detail: "Operatr RLS fixture" }) },
    { table: "chat_value_estimates", key: "message_id", id: (f) => f.message, update: { minutes_saved: 31 }, build: (f, c) => ({ message_id: f.message, conversation_id: c.id, user_id: c.account.id, minutes_saved: 30, hourly_rate: 100, source: "user" }) },
  ];
  const path = (spec, id) => `/rest/v1/${spec.table}?${spec.key}=eq.${encodeURIComponent(id)}&select=${spec.key}`;
  const requireRows = (response, count, message) => {
    if (!response.ok || !Array.isArray(response.body) || response.body.length !== count) throw new Error(message);
  };
  for (const spec of specs) {
    for (let i = 0; i < 2; i++) {
      const conversation = conversations[i];
      const id = spec.id(fixtures[i]);
      rows.push({ path: path(spec, id), token: conversation.account.token, table: spec.table });
      const response = await api(`/rest/v1/${spec.table}?select=${spec.key}`, conversation.account.token, {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(spec.build(fixtures[i], conversation)),
      });
      requireRows(response, 1, `INCONCLUSIVE: account ${i + 1} could not create its synthetic ${spec.table} record.`);
    }
    for (let i = 0; i < 2; i++) {
      const token = conversations[i].account.token;
      requireRows(await api(path(spec, spec.id(fixtures[i])), token), 1, `INCONCLUSIVE: account ${i + 1} cannot read its own ${spec.table} fixture.`);
      requireRows(await api(path(spec, spec.id(fixtures[i])), token, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(spec.update) }), 1, `INCONCLUSIVE: account ${i + 1} cannot update its own ${spec.table} fixture.`);
      const otherPath = path(spec, spec.id(fixtures[1 - i]));
      requireRows(await api(otherPath, token), 0, `FAIL or INCONCLUSIVE: account ${i + 1} cross-account ${spec.table} read was not an empty successful response.`);
      requireRows(await api(otherPath, token, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(spec.update) }), 0, `FAIL or INCONCLUSIVE: account ${i + 1} cross-account ${spec.table} update was not an empty successful response.`);
      requireRows(await api(otherPath, token, { method: "DELETE", headers: { Prefer: "return=representation" } }), 0, `FAIL or INCONCLUSIVE: account ${i + 1} cross-account ${spec.table} delete was not an empty successful response.`);
    }
    // Ownership checks include a positive target-exists control after attacks.
    for (let i = 0; i < 2; i++) requireRows(await api(path(spec, spec.id(fixtures[i])), conversations[i].account.token), 1, `FAIL or INCONCLUSIVE: ${spec.table} fixture missing after cross-account attempts.`);
    log(`PASS: both accounts own read/update and cross-account read/update/delete for ${spec.table}`);
  }
  return rows;
}
