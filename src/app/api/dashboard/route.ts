import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Run = {
  id: string;
  conversation_id: string;
  completed_at: string | null;
  chat_conversations: { title: string } | null;
};

export async function GET(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!allowRequest(`dashboard:read:${auth.user.id}`, 60)) return jsonError("rate_limited", "Too many requests. Try again shortly.", requestId, 429);
    const query = `chat_agent_runs?user_id=eq.${encodeURIComponent(auth.user.id)}&status=eq.completed&select=id,conversation_id,completed_at,chat_conversations(title)&order=completed_at.desc.nullslast&limit=10`;
    const result = await supabaseRest<Run[]>(query, auth.accessToken);
    if (result.error) return jsonError("dashboard_unavailable", "Recent work could not be loaded.", requestId, 503);
    return jsonOk({ runs: (result.data ?? []).map((run) => ({ id: run.id, conversationId: run.conversation_id, title: run.chat_conversations?.title || "Conversation", completedAt: run.completed_at })) }, requestId);
  } catch {
    return jsonError("dashboard_unavailable", "Recent work could not be loaded.", requestId, 503);
  }
}
