import { readJsonBody } from "@/lib/server/request-body";
import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Estimate = { message_id: string; conversation_id: string; source: "model" | "user" | "not_applicable"; minutes_saved: number; hourly_rate: number; created_at: string; updated_at: string };
function idFrom(request: Request) { const id = new URL(request.url).searchParams.get("messageId"); return id && UUID.test(id) ? id : null; }
function originValid(request: Request) {
  try { return request.headers.get("origin") === new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin; } catch { return false; }
}
async function owner(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const messageId = idFrom(request);
  if (!messageId) return { error: jsonError("invalid_message", "Select a saved response.", requestId, 400) };
  const auth = await getAuthenticatedRequest();
  if (!auth) return { error: jsonError("unauthorized", "Sign in is required.", requestId, 401) };
  if (!await allowRequest(`value-estimate:${auth.user.id}`, 60)) return { error: jsonError("rate_limited", "Try again shortly.", requestId, 429) };
  return { auth, messageId, requestId };
}
export async function GET(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const context = await owner(request);
    if ("error" in context) return context.error;
    const { auth, messageId } = context;
    const result = await supabaseRest<Estimate[]>(`chat_value_estimates?user_id=eq.${encodeURIComponent(auth.user.id)}&message_id=eq.${encodeURIComponent(messageId)}&select=message_id,conversation_id,source,minutes_saved,hourly_rate,created_at,updated_at&limit=1`, auth.accessToken);
    if (result.error) return jsonError("estimate_unavailable", "Time estimates are not available. Check that the Phase 5 database migration has been applied.", requestId, 503);
    return jsonOk({ estimate: result.data?.[0] || null }, requestId);
  } catch { return jsonError("estimate_unavailable", "The estimate could not be loaded.", requestId, 503); }
}
export async function PUT(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const context = await owner(request);
    if ("error" in context) return context.error;
    const { auth, messageId } = context;
    if (!originValid(request)) return jsonError("invalid_origin", "The request origin is invalid.", requestId, 403);
    if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected JSON.", requestId, 415);
    const body = await readJsonBody(request, 32_768) as { minutes?: unknown } | null;
    if (!Number.isInteger(body?.minutes) || (body!.minutes as number) < 1 || (body!.minutes as number) > 60000) return jsonError("invalid_estimate", "Enter between 1 and 60,000 minutes.", requestId, 400);
    const message = await supabaseRest<{ id: string; conversation_id: string }[]>(`chat_messages?id=eq.${encodeURIComponent(messageId)}&user_id=eq.${encodeURIComponent(auth.user.id)}&role=eq.assistant&status=eq.completed&select=id,conversation_id&limit=1`, auth.accessToken);
    if (message.error) return jsonError("estimate_unavailable", "The response could not be checked.", requestId, 503);
    if (!message.data?.length) return jsonError("not_found", "Saved completed response not found.", requestId, 404);
    const profile = await supabaseRest<{ hourly_rate: number | null }[]>(`profiles?id=eq.${encodeURIComponent(auth.user.id)}&select=hourly_rate&limit=1`, auth.accessToken);
    if (profile.error) return jsonError("profile_unavailable", "Your operating rate could not be loaded.", requestId, 503);
    const rate = profile.data?.[0]?.hourly_rate ?? 150;
    const stored = await supabaseRest<Estimate[]>("chat_value_estimates?on_conflict=message_id&select=message_id,conversation_id,source,minutes_saved,hourly_rate,created_at,updated_at", auth.accessToken, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ message_id: messageId, conversation_id: message.data![0].conversation_id, user_id: auth.user.id, minutes_saved: body!.minutes, hourly_rate: rate, source: "user" }) });
    if (stored.error || !stored.data?.[0]) return jsonError("estimate_unavailable", "The estimate could not be saved. Check that the Phase 5 database migration has been applied.", requestId, 503);
    return jsonOk({ estimate: stored.data[0] }, requestId);
  } catch { return jsonError("estimate_unavailable", "The estimate could not be saved.", requestId, 503); }
}
export async function DELETE(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const context = await owner(request);
    if ("error" in context) return context.error;
    const { auth, messageId } = context;
    if (!originValid(request)) return jsonError("invalid_origin", "The request origin is invalid.", requestId, 403);
    const deleted = await supabaseRest(`chat_value_estimates?user_id=eq.${encodeURIComponent(auth.user.id)}&message_id=eq.${encodeURIComponent(messageId)}`, auth.accessToken, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (deleted.error) return jsonError("estimate_unavailable", "The estimate could not be removed.", requestId, 503);
    return jsonOk({ deleted: true }, requestId);
  } catch { return jsonError("estimate_unavailable", "The estimate could not be removed.", requestId, 503); }
}
