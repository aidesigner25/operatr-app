import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
import { createConversation, listConversations } from "@/lib/server/chat-store";
import { isAllowedModel, isChatProvider, isResponseStyle } from "@/lib/server/chat-types";
import { getFeatureFlags } from "@/lib/server/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateConversationBody = { provider?: unknown; model?: unknown; responseStyle?: unknown; firstMessage?: unknown };

async function authOrError(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return { requestId, error: jsonError("unauthorized", "Sign in is required.", requestId, 401) };
    return { requestId, auth };
  } catch {
    return { requestId, error: jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503) };
  }
}

export async function GET(request: Request) {
  const result = await authOrError(request);
  if ("error" in result) return result.error;
  const { auth, requestId } = result;
  if (!allowRequest(`chat:list:${auth.user.id}`, 60)) return jsonError("rate_limited", "Too many chat requests. Try again shortly.", requestId, 429);

  const conversations = await listConversations(auth.accessToken);
  if (conversations.error) return jsonError("chat_unavailable", "Conversations could not be loaded.", requestId, 503);
  return jsonOk({ conversations: conversations.data || [] }, requestId);
}

export async function POST(request: Request) {
  const result = await authOrError(request);
  if ("error" in result) return result.error;
  const { auth, requestId } = result;
  if (!getFeatureFlags().chat) return jsonError("chat_disabled", "Chat is not enabled for this environment yet.", requestId, 503);
  if (!allowRequest(`chat:create:${auth.user.id}`, 20)) return jsonError("rate_limited", "Too many new conversations. Try again shortly.", requestId, 429);
  if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected an application/json request.", requestId, 415);

  const body = await request.json().catch(() => null) as CreateConversationBody | null;
  const firstMessage = typeof body?.firstMessage === "string" ? body.firstMessage.trim() : "";
  if (!isChatProvider(body?.provider) || !isAllowedModel(body.provider, body?.model) || !isResponseStyle(body?.responseStyle) || !firstMessage || firstMessage.length > 50_000) {
    return jsonError("invalid_conversation", "Choose a supported provider and model, then enter a message.", requestId, 400);
  }

  const conversation = await createConversation({
    userId: auth.user.id,
    provider: body.provider,
    model: body.model,
    responseStyle: body.responseStyle,
    firstMessage,
  }, auth.accessToken);
  if (conversation.error || !conversation.data) return jsonError("chat_unavailable", "The conversation could not be created.", requestId, 503);
  return jsonOk({ conversation: conversation.data }, requestId, { status: 201 });
}
