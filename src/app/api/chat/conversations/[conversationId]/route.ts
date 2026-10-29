import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest } from "@/lib/server/supabase";
import { getConversation, listMessages, renameConversation, updateConversationRuntime } from "@/lib/server/chat-store";
import { allowRequest } from "@/lib/server/rate-limit";
import { isAllowedModel, isChatProvider, isResponseStyle } from "@/lib/server/chat-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ conversationId: string }> };
type UpdateConversationBody = { title?: unknown; provider?: unknown; model?: unknown; responseStyle?: unknown };

export async function GET(request: Request, context: RouteContext) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const { conversationId } = await context.params;
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!allowRequest(`chat:read:${auth.user.id}`, 100)) return jsonError("rate_limited", "Too many chat requests. Try again shortly.", requestId, 429);

    const conversation = await getConversation(conversationId, auth.accessToken);
    if (conversation.error) return jsonError("chat_unavailable", "The conversation could not be loaded.", requestId, 503);
    if (!conversation.data) return jsonError("not_found", "Conversation not found.", requestId, 404);
    const messages = await listMessages(conversationId, auth.accessToken);
    if (messages.error) return jsonError("chat_unavailable", "Messages could not be loaded.", requestId, 503);
    return jsonOk({ conversation: conversation.data, messages: messages.data }, requestId);
  } catch {
    return jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const { conversationId } = await context.params;
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!allowRequest(`chat:configure:${auth.user.id}`, 30)) return jsonError("rate_limited", "Too many conversation changes. Try again shortly.", requestId, 429);
    if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected an application/json request.", requestId, 415);

    const body = await request.json().catch(() => null) as UpdateConversationBody | null;
    const title = typeof body?.title === "string" ? body.title.replace(/\s+/g, " ").trim() : undefined;
    const hasRuntime = body?.provider !== undefined || body?.model !== undefined || body?.responseStyle !== undefined;
    if (hasRuntime) {
      if (!isChatProvider(body?.provider) || !isAllowedModel(body.provider, body?.model) || !isResponseStyle(body?.responseStyle)) {
        return jsonError("invalid_runtime", "Choose a supported provider, model, and response effort.", requestId, 400);
      }
      const conversation = await updateConversationRuntime(conversationId, { provider: body.provider, model: body.model, responseStyle: body.responseStyle }, auth.accessToken);
      if (conversation.error) return jsonError("chat_unavailable", "The conversation settings could not be updated.", requestId, 503);
      if (!conversation.data) return jsonError("not_found", "Conversation not found.", requestId, 404);
      return jsonOk({ conversation: conversation.data }, requestId);
    }
    if (!title || title.length > 160) return jsonError("invalid_title", "Enter a title between 1 and 160 characters.", requestId, 400);
    const conversation = await renameConversation(conversationId, title, auth.accessToken);
    if (conversation.error) return jsonError("chat_unavailable", "The conversation title could not be updated.", requestId, 503);
    if (!conversation.data) return jsonError("not_found", "Conversation not found.", requestId, 404);
    return jsonOk({ conversation: conversation.data }, requestId);
  } catch {
    return jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503);
  }
}
