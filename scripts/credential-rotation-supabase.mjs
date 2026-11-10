// Explicitly constructed maintenance adapter. Importing this file does not
// connect to Supabase, read secrets, or modify data. Never use in client code.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLES = {
  vault_credentials: { key: "id", select: "id,user_id,provider,encrypted_credential,key_id,encryption_version,updated_at" },
  google_workspace_connections: { key: "user_id", select: "user_id,encrypted_refresh_token,updated_at" },
};

export async function createSupabaseRotationStore({ projectUrl, maintenanceKey, allowWrites = false, request = fetch }) {
  let base;
  try { base = new URL(projectUrl); } catch { throw new Error("Invalid maintenance connection configuration."); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/" || typeof maintenanceKey !== "string" || !maintenanceKey.trim() || typeof allowWrites !== "boolean") throw new Error("Invalid maintenance connection configuration.");
  const key = maintenanceKey.trim();
  const headers = { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) };
  async function call(path, options = {}) {
    let response;
    try {
      response = await request(new URL(path, base), { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store" });
    } catch { throw new Error("Maintenance service request failed."); }
    if (!response.ok) throw new Error("Maintenance service rejected the request.");
    let body;
    try { body = await response.json(); } catch { throw new Error("Maintenance service returned an invalid response."); }
    return { body, headers: response.headers };
  }
  async function rpc(name, payload) {
    const response = await call(`/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (typeof response.body !== "boolean") throw new Error("Maintenance service returned an invalid response.");
    return response.body;
  }
  // A user/public key could otherwise see zero rows and falsely pass preflight.
  if (await rpc("operatr_rotation_role_check", {}) !== true) throw new Error("Maintenance role could not be verified.");
  return {
    async scan(table, cursor, limit) {
      const definition = TABLES[table];
      if (!definition || (cursor !== null && !UUID.test(cursor)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid scan request.");
      const params = new URLSearchParams({ select: definition.select, order: `${definition.key}.asc`, limit: String(limit) });
      if (cursor !== null) params.set(definition.key, `gt.${cursor}`);
      const result = await call(`/rest/v1/${table}?${params}`, { headers: { Prefer: "count=exact" } });
      if (!Array.isArray(result.body) || result.body.length > limit) throw new Error("Invalid scan response.");
      // Prevent a backend row cap or proxy from turning an incomplete page into
      // a false end-of-table result. The count refers to rows after the cursor.
      const contentRange = result.headers.get("content-range") || "";
      const match = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(contentRange);
      if (!match) throw new Error("Complete scan count is unavailable.");
      const remaining = Number(match[3]);
      const rangeMatches = result.body.length === 0 ? match[1] === undefined && remaining === 0 : Number(match[1]) === 0 && Number(match[2]) === result.body.length - 1;
      if (!rangeMatches || !Number.isSafeInteger(remaining) || remaining < result.body.length || (result.body.length < limit && remaining !== result.body.length)) throw new Error("Credential scan is incomplete.");
      return result.body;
    },
    async compareAndSwap(table, original, replacement) {
      if (!allowWrites) throw new Error("Maintenance adapter is read-only.");
      if (table === "vault_credentials") {
        return rpc("operatr_rotate_vault_credential", {
          p_id: original.id, p_user_id: original.user_id, p_provider: original.provider,
          p_updated_at: original.updated_at, p_old_ciphertext: original.encrypted_credential,
          p_old_key_id: original.key_id, p_old_version: original.encryption_version,
          p_new_ciphertext: replacement.encrypted_credential, p_new_key_id: replacement.key_id,
          p_new_version: replacement.encryption_version,
        });
      }
      if (table === "google_workspace_connections") {
        return rpc("operatr_rotate_google_connection", {
          p_user_id: original.user_id, p_updated_at: original.updated_at,
          p_old_ciphertext: original.encrypted_refresh_token, p_new_ciphertext: replacement.encrypted_refresh_token,
        });
      }
      throw new Error("Invalid rotation table.");
    },
  };
}
