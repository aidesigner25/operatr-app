import { NextResponse } from "next/server";
import { getAuthenticatedRequest } from "@/lib/server/supabase";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { allowRequest } from "@/lib/server/rate-limit";
import { createRequestId, jsonError } from "@/lib/server/http";
import { createGoogleAuthorization, googleConfig, GOOGLE_STATE_COOKIE, OAUTH_LIFETIME_SECONDS, sameOrigin } from "@/lib/server/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const id = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", id, 401);
    const config = googleConfig();
    if (!getFeatureFlags().googleWorkspace || !config) return jsonError("google_disabled", "Google Workspace is not configured yet.", id, 503);
    if (!sameOrigin(request, config)) return jsonError("invalid_origin", "The request origin is invalid.", id, 403);
    if (!allowRequest(`google:connect:${auth.user.id}`, 10, 600_000)) return jsonError("rate_limited", "Try again later.", id, 429);
    const flow = createGoogleAuthorization(auth.user.id, config);
    const response = NextResponse.json({ data: { url: flow.url }, requestId: id }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(GOOGLE_STATE_COOKIE, flow.cookie, { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/google-workspace/callback", maxAge: OAUTH_LIFETIME_SECONDS });
    return response;
  } catch { return jsonError("google_unavailable", "Google Workspace connection could not be started.", id, 503); }
}
