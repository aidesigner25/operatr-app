import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", id, 401);
    if (!allowRequest(`value-summary:${auth.user.id}`, 60)) return jsonError("rate_limited", "Try again shortly.", id, 429);
    const requestedZone = new URL(request.url).searchParams.get("timezone") || "UTC";
    let timezone = "UTC";
    try { if (requestedZone.length <= 80) timezone = new Intl.DateTimeFormat("en-US", { timeZone: requestedZone }).resolvedOptions().timeZone; } catch { /* Use UTC when a browser supplies an invalid zone. */ }
    const result = await supabaseRest<{ count: number; minutes: number; value: number; months: { month: string; minutes: number; value: number }[] }>("rpc/value_estimate_summary_local", auth.accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_timezone: timezone }) });
    if (result.error || !result.data) return jsonError("estimate_unavailable", "Value estimates are unavailable. Apply the latest value trajectory database migration.", id, 503);
    return jsonOk({ summary: result.data }, id);
  } catch { return jsonError("estimate_unavailable", "Value estimates could not be loaded.", id, 503); }
}
