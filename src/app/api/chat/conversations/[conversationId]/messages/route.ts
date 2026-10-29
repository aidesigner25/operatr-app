import { createRequestId, jsonError } from "@/lib/server/http";
import { getAuthenticatedRequest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
import { createAgentRun, finishAgentRun, getConversation, listMessages, renameConversation, saveAgentTraceEvent, saveMessage, toProviderMessages, touchConversation } from "@/lib/server/chat-store";
import { ChatRuntimeError, generateConversationTitle, loadProviderCredential, streamProviderResponse } from "@/lib/server/chat-provider";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { AGENT_RUNTIME_TIMEOUT_MS, boundedProviderMessages, isSafeRetryable, maxOutputTokensFor, runStatusFor, type AgentTraceStage } from "@/lib/server/agent-runtime";
import { loadOperatorPreferences, operatorSystemInstruction } from "@/lib/server/operator-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ conversationId: string }> };
type MessageBody = { content?: unknown };
const encoder = new TextEncoder();

function event(type: string, data: Record<string, unknown>) {
  return encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const { conversationId } = await context.params;
  if (!getFeatureFlags().chat) return jsonError("chat_disabled", "Chat is not enabled for this environment yet.", requestId, 503);
  if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected an application/json request.", requestId, 415);

  const body = await request.json().catch(() => null) as MessageBody | null;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 50_000) return jsonError("invalid_message", "Enter a message up to 50,000 characters.", requestId, 400);

  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!allowRequest(`chat:send:${auth.user.id}`, 20, 60_000)) return jsonError("rate_limited", "Too many messages. Try again shortly.", requestId, 429);

    const conversation = await getConversation(conversationId, auth.accessToken);
    if (conversation.error) return jsonError("chat_unavailable", "The conversation could not be loaded.", requestId, 503);
    if (!conversation.data) return jsonError("not_found", "Conversation not found.", requestId, 404);

    const userMessage = await saveMessage({ conversationId, userId: auth.user.id, role: "user", content, status: "completed" }, auth.accessToken);
    if (userMessage.error) return jsonError("chat_unavailable", "Your message could not be saved.", requestId, 503);
    const history = await listMessages(conversationId, auth.accessToken);
    if (history.error) return jsonError("chat_unavailable", "Conversation history could not be loaded.", requestId, 503);
    const isOpeningExchange = history.data.length === 1;
    const credential = await loadProviderCredential({ userId: auth.user.id, provider: conversation.data.provider, accessToken: auth.accessToken });
    const preferences = await loadOperatorPreferences(auth.user.id, auth.accessToken);
    const systemInstruction = operatorSystemInstruction(conversation.data.response_style, preferences);
    const providerMessages = boundedProviderMessages(toProviderMessages(history.data));
    const maxOutputTokens = maxOutputTokensFor(conversation.data.response_style);
    const run = await createAgentRun({
      conversationId,
      userId: auth.user.id,
      provider: conversation.data.provider,
      model: conversation.data.model,
      responseStyle: conversation.data.response_style,
      maxOutputTokens,
      inputCharacters: providerMessages.reduce((total, message) => total + message.content.length, 0),
    }, auth.accessToken);
    if (run.error || !run.data) return jsonError("runtime_unavailable", "The agent runtime could not be started.", requestId, 503);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = "";
        let completed = false;
        let retryCount = 0;
        let failure: unknown;
        const timeout = AbortSignal.timeout(AGENT_RUNTIME_TIMEOUT_MS);
        const signal = AbortSignal.any([request.signal, timeout]);
        const trace = async (stage: AgentTraceStage, detail: string) => {
          await saveAgentTraceEvent({ runId: run.data!.id, userId: auth.user.id, stage, detail }, auth.accessToken);
          try {
            controller.enqueue(event("trace", { stage, detail }));
          } catch {
            // The client may have disconnected, but the server still finalizes its private run record.
          }
        };
        try {
          controller.enqueue(event("meta", { conversationId, requestId }));
          await trace("preparing", "Preparing private context");
          while (!completed) {
            let emittedText = false;
            await trace("generating", retryCount ? "Retrying the selected model" : "Generating with the selected model");
            try {
              for await (const delta of streamProviderResponse({
                provider: conversation.data!.provider,
                model: conversation.data!.model,
                responseStyle: conversation.data!.response_style,
                messages: providerMessages,
                credential,
                systemInstruction,
                signal,
                maxTokens: maxOutputTokens,
              })) {
                emittedText = true;
                answer += delta;
                controller.enqueue(event("delta", { text: delta }));
              }
              completed = true;
            } catch (caught) {
              failure = caught;
              // A retry may only occur before any provider text reaches the user. It always
              // keeps the same provider and model, so a prompt never changes recipients.
              if (!emittedText && retryCount === 0 && !signal.aborted && isSafeRetryable(caught)) {
                retryCount = 1;
                await trace("retrying", "Retrying once before response starts");
                continue;
              }
              break;
            }
          }
          if (!completed && (timeout.aborted || !(failure instanceof DOMException && failure.name === "AbortError"))) {
            const message = timeout.aborted && !request.signal.aborted
              ? "The selected model exceeded Operatr's 90-second run limit."
              : failure instanceof ChatRuntimeError ? failure.message : "The provider could not complete this request.";
            controller.enqueue(event("error", { code: failure instanceof ChatRuntimeError ? failure.code : "provider_error", message }));
          }
        } finally {
          const status = completed ? "completed" : runStatusFor(failure, timeout.aborted && !request.signal.aborted);
          await trace("saving", "Saving the run record");
          if (answer.trim()) {
            await saveMessage({
              conversationId,
              userId: auth.user.id,
              role: "assistant",
              content: answer,
              status: completed ? "completed" : "cancelled",
            }, auth.accessToken);
          }
          await finishAgentRun({
            runId: run.data!.id,
            status,
            outputCharacters: answer.length,
            retryCount,
            errorCode: failure instanceof ChatRuntimeError ? failure.code : status === "timed_out" ? "runtime_timeout" : undefined,
          }, auth.accessToken);
          const terminalStage: AgentTraceStage = status === "completed"
            ? "completed"
            : status === "timed_out"
              ? "timed_out"
              : status === "cancelled"
                ? "cancelled"
                : "failed";
          await trace(terminalStage, status === "completed" ? "Run complete" : status === "timed_out" ? "Run timed out" : status === "cancelled" ? "Run stopped" : "Run could not complete");
          if (isOpeningExchange && completed && answer.trim() && !request.signal.aborted) {
            try {
              const title = await generateConversationTitle({
                provider: conversation.data!.provider,
                model: conversation.data!.model,
                credential,
                openingMessage: content.slice(0, 5_000),
                signal: AbortSignal.timeout(8_000),
              });
              if (title) {
                const renamed = await renameConversation(conversationId, title, auth.accessToken);
                if (renamed.data) controller.enqueue(event("title", { title: renamed.data.title }));
              }
            } catch {
              // A title is a convenience only; never fail an otherwise completed chat.
            }
          }
          await touchConversation(conversationId, auth.accessToken);
          controller.enqueue(event("done", { status: completed ? "completed" : "cancelled" }));
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (caught) {
    if (caught instanceof ChatRuntimeError) return jsonError(caught.code, caught.message, requestId, caught.status);
    return jsonError("chat_unavailable", "Chat is unavailable right now.", requestId, 503);
  }
}
