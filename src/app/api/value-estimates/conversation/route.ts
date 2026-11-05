import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
  const id = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", id, 401);
    if (!allowRequest(`value-list:${auth.user.id}`, 120)) return jsonError("rate_limited", "Try again shortly.", id, 429);
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (!conversationId || !UUID.test(conversationId)) return jsonError("invalid_conversation", "Select a conversation.", id, 400);
    const result = await supabaseRest<unknown[]>(`chat_value_estimates?user_id=eq.${encodeURIComponent(auth.user.id)}&conversation_id=eq.${encodeURIComponent(conversationId)}&select=message_id,minutes_saved,hourly_rate,source,created_at,updated_at&order=created_at.asc&limit=100`, auth.accessToken);
    if (result.error) return jsonError("estimate_unavailable", "Value estimates could not be loaded.", id, 503);
    return jsonOk({ estimates: result.data || [] }, id);
  } catch { return jsonError("estimate_unavailable", "Value estimates could not be loaded.", id, 503); }
}
