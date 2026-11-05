import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { ChatRuntimeError, loadProviderCredential } from "@/lib/server/chat-provider";
import { assessValue } from "@/lib/server/value-assessment";
import { continuationTask } from "@/lib/shared/task-continuation";
import type { ChatProvider, ResponseStyle } from "@/lib/server/chat-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Message = { id: string; conversation_id: string; content: string; created_at: string; chat_conversations: { provider: ChatProvider; model: string; response_style: ResponseStyle } | null };
export async function POST(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!getFeatureFlags().chat) return jsonError("chat_disabled", "Chat is not enabled.", requestId, 503);
    let origin: string;
    try { origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin; } catch { return jsonError("invalid_origin", "The request origin is invalid.", requestId, 403); }
    if (request.headers.get("origin") !== origin) return jsonError("invalid_origin", "The request origin is invalid.", requestId, 403);
    if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected JSON.", requestId, 415);
    if (!allowRequest(`value-retry:${auth.user.id}`, 6, 600_000)) return jsonError("rate_limited", "Too many estimate retries. Try again later.", requestId, 429);
    const body = await request.json().catch(() => null) as { messageId?: unknown } | null;
    if (typeof body?.messageId !== "string" || !UUID.test(body.messageId)) return jsonError("invalid_message", "Select a saved response.", requestId, 400);
    const messageId = body.messageId;
    const existing = await supabaseRest<{ message_id: string; source: string }[]>(`chat_value_estimates?user_id=eq.${encodeURIComponent(auth.user.id)}&message_id=eq.${encodeURIComponent(messageId)}&select=message_id,source&limit=1`, auth.accessToken);
    if (existing.error) return jsonError("estimate_unavailable", "Value tracking storage is unavailable. Check the database setup.", requestId, 503);
    if (existing.data?.length && existing.data[0].source !== "not_applicable") return jsonOk({ status: "already_exists" }, requestId);
    const result = await supabaseRest<Message[]>(`chat_messages?id=eq.${encodeURIComponent(messageId)}&user_id=eq.${encodeURIComponent(auth.user.id)}&role=eq.assistant&status=eq.completed&select=id,conversation_id,content,created_at,chat_conversations(provider,model,response_style)&limit=1`, auth.accessToken);
    if (result.error) return jsonError("estimate_unavailable", "The saved response could not be loaded.", requestId, 503);
    const message = result.data?.[0];
    if (!message?.chat_conversations) return jsonError("not_found", "Saved completed response not found.", requestId, 404);
    const prior = await supabaseRest<{ role: string; content: string; status: string }[]>(`chat_messages?conversation_id=eq.${encodeURIComponent(message.conversation_id)}&user_id=eq.${encodeURIComponent(auth.user.id)}&created_at=lt.${encodeURIComponent(message.created_at)}&select=role,content,status&order=created_at.desc&limit=100`, auth.accessToken);
    if (prior.error || !prior.data?.length) return jsonError("estimate_unavailable", "The original request could not be loaded.", requestId, 503);
    const task = continuationTask([...prior.data].reverse());
    const { provider, model, response_style: responseStyle } = message.chat_conversations;
    const credential = await loadProviderCredential({ userId: auth.user.id, provider, accessToken: auth.accessToken });
    const assessment = await assessValue({ userId: auth.user.id, accessToken: auth.accessToken, messageId, conversationId: message.conversation_id, provider, model, responseStyle, credential, prompt: task.prompt, answer: message.content, previousSegments: task.segments, replaceNotApplicable: existing.data?.[0]?.source === "not_applicable", recentContext: "", research: "Existing saved response; any links in the response were not independently reverified. Research was not rerun.", signal: request.signal });
    return jsonOk(assessment, requestId);
  } catch (error) {
    if (error instanceof ChatRuntimeError) return jsonError(error.code, error.message, requestId, error.status);
    return jsonError("estimate_unavailable", "The estimate could not be retried.", requestId, 503);
  }
}
