import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CredentialRecord = {
  provider: string;
  last_four: string;
  encryption_version: number;
  key_id: string;
  created_at: string;
  updated_at: string;
};

async function authenticatedRequestOrError(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return { requestId, error: jsonError("unauthorized", "Sign in is required.", requestId, 401) };
    if (!allowRequest(`vault:list:${auth.user.id}`, 30)) {
      return { requestId, error: jsonError("rate_limited", "Too many vault requests. Try again shortly.", requestId, 429) };
    }
    return { requestId, auth };
  } catch {
    return { requestId, error: jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503) };
  }
}

export async function GET(request: Request) {
  const result = await authenticatedRequestOrError(request);
  if ("error" in result) return result.error;

  const { auth, requestId } = result;
  const vault = await supabaseRest<CredentialRecord[]>(
    `vault_credentials?select=provider,last_four,encryption_version,key_id,created_at,updated_at&order=provider.asc`,
    auth.accessToken,
  );
  if (vault.error) return jsonError("vault_unavailable", "Credential status could not be loaded.", requestId, 503);

  return jsonOk({
    credentials: (vault.data || []).map((credential) => ({
      provider: credential.provider,
      lastFour: credential.last_four,
      encryptionVersion: credential.encryption_version,
      keyId: credential.key_id,
      connectedAt: credential.created_at,
      updatedAt: credential.updated_at,
    })),
  }, requestId);
}

export async function DELETE(request: Request) {
  const result = await authenticatedRequestOrError(request);
  if ("error" in result) return result.error;

  const { auth, requestId } = result;
  const deleted = await supabaseRest<CredentialRecord[]>("vault_credentials?select=provider", auth.accessToken, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (deleted.error) return jsonError("vault_unavailable", "Credentials could not be removed.", requestId, 503);

  await supabaseRest("vault_audit_events", auth.accessToken, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: auth.user.id, action: "purged_all", request_id: requestId }),
  });

  return jsonOk({ deleted: deleted.data?.length || 0 }, requestId);
}
