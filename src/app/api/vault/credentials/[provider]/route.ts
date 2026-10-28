import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
import { encryptCredential, isCredentialProvider, validateCredential } from "@/lib/server/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };
type CredentialBody = { credential?: unknown };

async function getContext(request: Request, context: RouteContext) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const { provider } = await context.params;
  if (!isCredentialProvider(provider)) {
    return { requestId, error: jsonError("invalid_provider", "This provider is not supported.", requestId, 404) };
  }

  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return { requestId, error: jsonError("unauthorized", "Sign in is required.", requestId, 401) };
    if (!allowRequest(`vault:write:${auth.user.id}`, 12)) {
      return { requestId, error: jsonError("rate_limited", "Too many credential changes. Try again shortly.", requestId, 429) };
    }
    return { requestId, provider, auth };
  } catch {
    return { requestId, error: jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503) };
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const result = await getContext(request, context);
  if ("error" in result) return result.error;
  const { requestId, provider, auth } = result;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError("invalid_content_type", "Expected an application/json request.", requestId, 415);
  }
  const body = await request.json().catch(() => null) as CredentialBody | null;
  const credential = validateCredential(body?.credential);
  if (!credential) return jsonError("invalid_credential", "Enter a valid credential.", requestId, 400);

  try {
    const encrypted = encryptCredential(credential, auth.user.id, provider);
    const stored = await supabaseRest("vault_credentials?on_conflict=user_id,provider", auth.accessToken, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: auth.user.id,
        provider,
        encrypted_credential: encrypted.ciphertext,
        encryption_version: encrypted.encryptionVersion,
        key_id: encrypted.keyId,
        last_four: encrypted.lastFour,
      }),
    });
    if (stored.error) return jsonError("vault_unavailable", "Credential could not be stored.", requestId, 503);

    await supabaseRest("vault_audit_events", auth.accessToken, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: auth.user.id, provider, action: "upserted", request_id: requestId }),
    });

    return jsonOk({ provider, lastFour: encrypted.lastFour, connected: true }, requestId);
  } catch {
    return jsonError("vault_unavailable", "Credential encryption is not configured yet.", requestId, 503);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const result = await getContext(request, context);
  if ("error" in result) return result.error;
  const { requestId, provider, auth } = result;

  const deleted = await supabaseRest(`vault_credentials?provider=eq.${provider}`, auth.accessToken, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (deleted.error) return jsonError("vault_unavailable", "Credential could not be removed.", requestId, 503);

  await supabaseRest("vault_audit_events", auth.accessToken, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: auth.user.id, provider, action: "deleted", request_id: requestId }),
  });

  return jsonOk({ provider, deleted: true }, requestId);
}
