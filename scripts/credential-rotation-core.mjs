// Backend-independent rotation logic. No network adapter or CLI is provided.
// Callers must supply a store implementing scan and atomic compareAndSwap and
// the application's vault crypto functions. Nothing executes at import time.
const TABLES = ["vault_credentials", "google_workspace_connections"];
const PAGE_SIZE = 100;

export class RotationError extends Error {
  constructor(code, message, rotated = 0) { super(message); this.code = code; this.rotated = rotated; }
}

function inspect(row, table, vault, activeKeyId) {
  const ciphertext = table === "vault_credentials" ? row.encrypted_credential : row.encrypted_refresh_token;
  const purpose = table === "vault_credentials" ? row.provider : "google_workspace";
  if (typeof row.user_id !== "string" || typeof row.updated_at !== "string" || typeof ciphertext !== "string" || typeof purpose !== "string") throw new Error("invalid row");
  if (table === "vault_credentials" && !vault.isCredentialProvider(purpose)) throw new Error("invalid provider");
  const parts = ciphertext.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || !parts[1]) throw new Error("invalid ciphertext");
  if (table === "vault_credentials" && (row.key_id !== parts[1] || row.encryption_version !== 1)) throw new Error("metadata mismatch");
  const plaintext = vault.decryptCredential(ciphertext, row.user_id, purpose);
  if (parts[1] === activeKeyId) return null;
  const replacement = vault.encryptCredential(plaintext, row.user_id, purpose);
  if (replacement.keyId !== activeKeyId || vault.decryptCredential(replacement.ciphertext, row.user_id, purpose) !== plaintext) throw new Error("round trip failed");
  return table === "vault_credentials"
    ? { encrypted_credential: replacement.ciphertext, key_id: replacement.keyId, encryption_version: replacement.encryptionVersion }
    : { encrypted_refresh_token: replacement.ciphertext };
}

async function walk(store, vault, activeKeyId, apply, summary) {
  for (const table of TABLES) {
    let cursor = null;
    while (true) {
      let page;
      try { page = await store.scan(table, cursor, PAGE_SIZE); }
      catch { throw new RotationError("scan_failed", `Credential scan failed for ${table}; rotation stopped.`, summary.rotated); }
      if (!Array.isArray(page) || page.length > PAGE_SIZE) throw new RotationError("invalid_page", "Credential scan returned an invalid page.", summary.rotated);
      for (const row of page) {
        const id = table === "vault_credentials" ? row.id : row.user_id;
        if (typeof id !== "string" || !id || (cursor !== null && id <= cursor)) throw new RotationError("invalid_cursor", "Credential scan was not strictly ordered.", summary.rotated);
        cursor = id;
        let replacement;
        try { replacement = inspect(row, table, vault, activeKeyId); }
        catch { throw new RotationError("unreadable_record", `A ${table} record could not be verified; rotation stopped.`, summary.rotated); }
        summary.scanned++;
        if (!replacement) { summary.current++; continue; }
        summary.requiresRotation++;
        if (apply) {
          // The store MUST atomically match identity, original updated_at,
          // ciphertext and vault metadata before writing the replacement.
          // A mismatch can mean a user reconnected or changed a credential.
          let updated;
          try { updated = await store.compareAndSwap(table, row, replacement); }
          catch { throw new RotationError("update_failed", `A ${table} update failed; rotation stopped. Its outcome may be unknown.`, summary.rotated); }
          if (updated !== true) throw new RotationError("concurrent_change", `A ${table} record changed during rotation; rotation stopped.`, summary.rotated);
          summary.rotated++;
        }
      }
      if (page.length < PAGE_SIZE) break;
    }
  }
}

/** Full preflight first; no writes unless apply is explicitly true. */
export async function rotateCredentials({ store, vault, activeKeyId, apply = false }) {
  if (!store || typeof store.scan !== "function" || !vault || typeof vault.decryptCredential !== "function" || typeof vault.encryptCredential !== "function" || typeof vault.isCredentialProvider !== "function" || typeof activeKeyId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(activeKeyId)) throw new RotationError("invalid_configuration", "Credential rotation configuration is invalid.");
  if (apply !== false && apply !== true) throw new RotationError("invalid_configuration", "Rotation mode must be explicitly enabled.");
  if (apply && typeof store.compareAndSwap !== "function") throw new RotationError("invalid_configuration", "Atomic update support is required.");
  try {
    const probe = vault.encryptCredential("operatr-rotation-probe", "rotation-probe-user", "openai");
    if (probe.keyId !== activeKeyId || vault.decryptCredential(probe.ciphertext, "rotation-probe-user", "openai") !== "operatr-rotation-probe") throw new Error("key mismatch");
  } catch { throw new RotationError("invalid_configuration", "Active encryption key could not be verified."); }
  const preflight = { scanned: 0, current: 0, requiresRotation: 0, rotated: 0 };
  await walk(store, vault, activeKeyId, false, preflight);
  if (!apply) return { mode: "dry-run", ...preflight };
  const applied = { scanned: 0, current: 0, requiresRotation: 0, rotated: 0 };
  await walk(store, vault, activeKeyId, true, applied);
  return { mode: "apply", ...applied };
}
