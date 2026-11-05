import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { allowRequest } from "@/lib/server/rate-limit";
import { googleConfig, sameOrigin } from "@/lib/server/google-workspace";
import { joinContinuationMarkdown } from "@/lib/shared/continuation-markdown";
import { continuationTask } from "@/lib/shared/task-continuation";
import { exportGoogleResponse, GoogleExportError } from "@/lib/server/google-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Message = { conversation_id: string; created_at: string; content: string; role: string; status: string; chat_conversations: { title: string } | null };
export async function POST(request: Request) {
  const id = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", id, 401);
    const config = googleConfig();
    if (!getFeatureFlags().googleWorkspace || !config) return jsonError("google_disabled", "Google Workspace is not enabled.", id, 503);
    if (!sameOrigin(request, config)) return jsonError("invalid_origin", "The request origin is invalid.", id, 403);
    if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected JSON.", id, 415);
    if (!allowRequest(`google:export:${auth.user.id}`, 10, 600_000)) return jsonError("rate_limited", "Too many exports. Try again later.", id, 429);
    const body = await request.json().catch(() => null) as { messageId?: unknown; kind?: unknown } | null;
    if (typeof body?.messageId !== "string" || !UUID.test(body.messageId) || (body.kind !== "doc" && body.kind !== "sheet")) return jsonError("invalid_export", "Select a saved response and export format.", id, 400);
    const query = `chat_messages?id=eq.${encodeURIComponent(body.messageId)}&user_id=eq.${encodeURIComponent(auth.user.id)}&select=conversation_id,created_at,content,role,status,chat_conversations(title)&limit=1`;
    const record = await supabaseRest<Message[]>(query, auth.accessToken);
    if (record.error) return jsonError("export_unavailable", "The response could not be loaded.", id, 503);
    const message = record.data?.[0];
    if (!message || message.role !== "assistant" || message.status !== "completed") return jsonError("not_found", "Saved completed response not found.", id, 404);
    const prior = await supabaseRest<{ role: string; content: string; status: string }[]>(`chat_messages?conversation_id=eq.${encodeURIComponent(message.conversation_id)}&user_id=eq.${encodeURIComponent(auth.user.id)}&created_at=lt.${encodeURIComponent(message.created_at)}&select=role,content,status&order=created_at.desc&limit=100`, auth.accessToken);
    if (prior.error) return jsonError("export_unavailable", "The response history could not be loaded.", id, 503);
    const task = continuationTask([...(prior.data || [])].reverse());
    const result = await exportGoogleResponse({ kind: body.kind, title: message.chat_conversations?.title || "Operatr response", content: joinContinuationMarkdown([...task.segments, message.content]), userId: auth.user.id, accessToken: auth.accessToken });
    return jsonOk(result, id);
  } catch (caught) {
    if (caught instanceof GoogleExportError) {
      if (caught.partialUrl) return jsonOk({ url: caught.partialUrl, partial: true, message: caught.message }, id);
      return jsonError("google_export_failed", caught.message, id, caught.status);
    }
    return jsonError("export_unavailable", "Export could not be completed. Check Google Drive before trying again.", id, 503);
  }
}
