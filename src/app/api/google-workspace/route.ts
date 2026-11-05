import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { allowRequest } from "@/lib/server/rate-limit";
import { googleConfig, loadGoogleRefreshToken, sameOrigin } from "@/lib/server/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", id, 401);
    if (!allowRequest(`google:status:${auth.user.id}`, 60)) return jsonError("rate_limited", "Try again later.", id, 429);
    const configured = Boolean(googleConfig());
    const enabled = getFeatureFlags().googleWorkspace && configured;
    if (!configured) return jsonOk({ enabled: false, connected: false }, id);
    const stored = await supabaseRest<{ user_id: string }[]>(`google_workspace_connections?user_id=eq.${encodeURIComponent(auth.user.id)}&select=user_id&limit=1`, auth.accessToken);
    if (stored.error) return jsonError("google_unavailable", "Google Workspace status could not be loaded.", id, 503);
    return jsonOk({ enabled, connected: Boolean(stored.data?.length) }, id);
  } catch { return jsonError("google_unavailable", "Google Workspace status could not be loaded.", id, 503); }
}
export async function DELETE(request: Request) {
  const id = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", id, 401);
    const config = googleConfig();
    if (!config || !sameOrigin(request, config)) return jsonError("invalid_origin", "The request origin is invalid.", id, 403);
    if (!allowRequest(`google:disconnect:${auth.user.id}`, 10, 600_000)) return jsonError("rate_limited", "Try again later.", id, 429);
    const token = await loadGoogleRefreshToken(auth.user.id, auth.accessToken);
    if (token) {
      const revoked = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!revoked.ok) {
        const body = await revoked.json().catch(() => null) as { error?: string } | null;
        if (revoked.status !== 400 || body?.error !== "invalid_token") return jsonError("google_revoke_failed", "Google could not revoke the connection. Try again.", id, 503);
      }
    }
    const deleted = await supabaseRest(`google_workspace_connections?user_id=eq.${encodeURIComponent(auth.user.id)}`, auth.accessToken, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (deleted.error) return jsonError("google_unavailable", "The connection could not be removed. Try again.", id, 503);
    return jsonOk({ disconnected: true }, id);
  } catch { return jsonError("google_unavailable", "The connection could not be removed. Try again.", id, 503); }
}
