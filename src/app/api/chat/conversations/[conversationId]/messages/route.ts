import { createRequestId, jsonError } from "@/lib/server/http";
import { getAuthenticatedRequest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
import { createAgentRun, finishAgentRun, getConversation, listMessages, renameConversation, saveAgentTraceEvent, saveMessage, toProviderMessages, touchConversation } from "@/lib/server/chat-store";
import { ChatRuntimeError, deriveConversationTitle, generateConversationTitle, loadProviderCredential, streamProviderResponse } from "@/lib/server/chat-provider";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { AGENT_RUNTIME_TIMEOUT_MS, boundedProviderMessages, isSafeRetryable, maxOutputTokensFor, runStatusFor, type AgentTraceStage } from "@/lib/server/agent-runtime";
import { loadOperatorPreferences, operatorSystemInstruction } from "@/lib/server/operator-profile";
import { searchTavily, tavilyResearchInstruction, type TavilySource } from "@/lib/server/tavily";
import { apifyResearchInstruction, runApifyTask, selectApifyTask } from "@/lib/server/apify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ conversationId: string }> };
type MessageBody = { content?: unknown; useWeb?: unknown; useApify?: unknown };
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
  if (body?.useWeb !== undefined && typeof body.useWeb !== "boolean") return jsonError("invalid_research_request", "Invalid live web research setting.", requestId, 400);
  if (body?.useApify !== undefined && typeof body.useApify !== "boolean") return jsonError("invalid_research_request", "Invalid Apify research setting.", requestId, 400);
  const useWeb = body?.useWeb === true;
  const useApify = body?.useApify === true;
  const apifyTask = useApify ? selectApifyTask(content) : null;

  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!allowRequest(`chat:send:${auth.user.id}`, 20, 60_000)) return jsonError("rate_limited", "Too many messages. Try again shortly.", requestId, 429);
    if (useWeb && !getFeatureFlags().tavily) return jsonError("research_disabled", "Live web research is not enabled for this environment yet.", requestId, 503);
    if (useWeb && !allowRequest(`tavily:search:${auth.user.id}`, 8, 10 * 60_000)) return jsonError("research_rate_limited", "Live web research is limited to 8 searches per 10 minutes.", requestId, 429);
    if (useApify && !getFeatureFlags().apify) return jsonError("apify_disabled", "Apify research is not enabled for this environment yet.", requestId, 503);
    if (apifyTask && !allowRequest(`apify:run:${auth.user.id}`, 5, 10 * 60_000)) return jsonError("apify_rate_limited", "Apify research is limited to 5 runs per 10 minutes.", requestId, 429);

    const conversation = await getConversation(conversationId, auth.accessToken);
    if (conversation.error) return jsonError("chat_unavailable", "The conversation could not be loaded.", requestId, 503);
    if (!conversation.data) return jsonError("not_found", "Conversation not found.", requestId, 404);

    // Validate every requested recipient before persisting the user message. A missing
    // Tavily connection should never create an unanswered message in the conversation.
    const credential = await loadProviderCredential({ userId: auth.user.id, provider: conversation.data.provider, accessToken: auth.accessToken });
    const tavilyCredential = useWeb
      ? await loadProviderCredential({ userId: auth.user.id, provider: "tavily", accessToken: auth.accessToken })
      : null;
    const apifyCredential = apifyTask
      ? await loadProviderCredential({ userId: auth.user.id, provider: "apify", accessToken: auth.accessToken })
      : null;

    const userMessage = await saveMessage({ conversationId, userId: auth.user.id, role: "user", content, status: "completed" }, auth.accessToken);
    if (userMessage.error) return jsonError("chat_unavailable", "Your message could not be saved.", requestId, 503);
    const history = await listMessages(conversationId, auth.accessToken);
    if (history.error) return jsonError("chat_unavailable", "Conversation history could not be loaded.", requestId, 503);
    const isOpeningExchange = history.data.length === 1;
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
        let continuationCount = 0;
        let retryAfterEmptyOutputLimit = false;
        let failure: unknown;
        let sources: TavilySource[] = [];
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
          let requestSystemInstruction = systemInstruction;
          if (useWeb || useApify) {
            if (useWeb && tavilyCredential) await trace("preparing", "Searching live web with Tavily");
            if (apifyTask && apifyCredential) await trace("preparing", `Selected Apify ${apifyTask.replace("_", " ")} research`);
            if (useApify && !apifyTask) await trace("preparing", "Apify research needs a clearer target");
            const [tavilyResult, apifyOutcome] = await Promise.all([
              useWeb && tavilyCredential ? searchTavily({ query: content, credential: tavilyCredential, signal }) : Promise.resolve(null),
              apifyTask && apifyCredential
                ? runApifyTask({ task: apifyTask, prompt: content, credential: apifyCredential, signal })
                  .then((result) => ({ result, error: null }))
                  .catch((error: unknown) => {
                    if (signal.aborted) throw error;
                    return { result: null, error };
                  })
                : Promise.resolve({ result: null, error: null }),
            ]);
            if (tavilyResult) {
              sources = tavilyResult;
              requestSystemInstruction += tavilyResearchInstruction(sources);
              controller.enqueue(event("research", { sourceCount: sources.length, sources: sources.map(({ title, url }) => ({ title, url })) }));
              await trace("preparing", sources.length ? `Found ${sources.length} web sources` : "No web sources were returned");
            }
            if (apifyOutcome.result) {
              const { result: apifyResult } = apifyOutcome;
              if (apifyResult.sources.length) requestSystemInstruction += apifyResearchInstruction(apifyResult.label, apifyResult.sources);
              controller.enqueue(event("research", { sourceCount: apifyResult.sources.length, sources: apifyResult.sources.map(({ title, url }) => ({ title, url })) }));
              await trace("preparing", apifyResult.sources.length ? `Found ${apifyResult.sources.length} Apify sources${apifyResult.incomplete ? " before the response window closed" : ""}` : "Apify returned no usable evidence in time");
              if (apifyResult.incomplete) requestSystemInstruction += "\n\nThe requested Apify run did not finish within the research window. The available results may be incomplete; explain this limitation clearly and do not imply that missing competitors were researched.";
              if (!apifyResult.sources.length) requestSystemInstruction += "\n\nThe requested Apify run returned no usable evidence for this request before its response window closed. Tell the user the research timed out or returned no usable results. Do not claim the user needs to enable a capability that was already enabled, and do not present earlier conversation evidence as the new research.";
              if (!apifyResult.sources.length && !sources.length) {
                answer = apifyResult.incomplete
                  ? "The research did not return usable results before the response window closed. Please try again with a more specific topic or a direct source link."
                  : "The research completed but returned no usable results. Please try a different search phrase or a direct source link.";
                controller.enqueue(event("delta", { text: answer }));
                completed = true;
              }
            } else if (useApify && !apifyTask) {
              requestSystemInstruction += "\n\nThe user enabled Apify research, but the request has no eligible target. Do not claim that Apify was run. If the available evidence does not answer the request, ask them to include a public competitor or LinkedIn URL, or phrase the request as a buyer/customer pain, feedback, or demand question for Reddit.";
            } else if (apifyOutcome.error) {
              requestSystemInstruction += "\n\nThe requested Apify research did not complete. Do not claim that fresh Apify research was completed. Answer helpfully from the user's prompt and state briefly that the research source did not finish in time.";
              await trace("preparing", "Apify did not finish; continuing without it");
              if (!sources.length) {
                answer = apifyOutcome.error instanceof ChatRuntimeError && apifyOutcome.error.code === "apify_target_required"
                  ? apifyOutcome.error.message
                  : "The research tool could not complete this request. Please try again; if the issue persists, check your Apify connection and account limits.";
                controller.enqueue(event("delta", { text: answer }));
                completed = true;
              }
            }
          }
          while (!completed) {
            let emittedText = false;
            await trace("generating", continuationCount ? "Continuing the response" : retryCount ? "Retrying the selected model" : "Generating with the selected model");
            try {
              for await (const delta of streamProviderResponse({
                provider: conversation.data!.provider,
                model: conversation.data!.model,
                responseStyle: conversation.data!.response_style,
                messages: continuationCount ? [
                  ...providerMessages,
                  { role: "assistant", content: answer },
                  { role: "user", content: "Continue your previous response exactly where it stopped. Finish the current sentence or table first, then address the remaining parts of my original request. Do not repeat earlier content." },
                ] : providerMessages,
                credential,
                systemInstruction: requestSystemInstruction,
                signal,
                maxTokens: retryAfterEmptyOutputLimit ? Math.min(maxOutputTokens * 2, 8_000) : maxOutputTokens,
                lowReasoningEffort: retryAfterEmptyOutputLimit,
              })) {
                emittedText = true;
                answer += delta;
                controller.enqueue(event("delta", { text: delta }));
              }
              if (!answer.trim()) throw new ChatRuntimeError("provider_empty_response", "The selected model returned no text. Please try again or choose another model.", 502, true);
              failure = undefined;
              completed = true;
            } catch (caught) {
              failure = caught;
              if (caught instanceof ChatRuntimeError && caught.code === "provider_output_limit" && !answer.trim() && retryCount === 0 && !signal.aborted) {
                retryCount = 1;
                retryAfterEmptyOutputLimit = true;
                await trace("retrying", "Retrying after the model returned no visible text");
                continue;
              }
              if (caught instanceof ChatRuntimeError && caught.code === "provider_output_limit" && answer.trim() && continuationCount < 2 && !signal.aborted) {
                continuationCount += 1;
                continue;
              }
              if (caught instanceof ChatRuntimeError && caught.code === "provider_output_limit") {
                failure = new ChatRuntimeError("provider_output_limit", answer.trim() ? "The response reached its length limit before it could finish. Please ask to continue." : "The model reached its output limit without producing a visible answer. Please try another model or increase the response effort.", 502);
              }
              // A retry may only occur before any provider text reaches the user. It always
              // keeps the same provider and model, so a prompt never changes recipients.
              if (!emittedText && !answer.trim() && retryCount === 0 && !signal.aborted && isSafeRetryable(caught)) {
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
            // Naming is best effort, time-limited, and uses the same selected provider.
            let title: string | null = null;
            try {
              title = await generateConversationTitle({ provider: conversation.data!.provider, model: conversation.data!.model, credential, openingMessage: content.slice(0, 5_000), signal: AbortSignal.any([request.signal, AbortSignal.timeout(6_000)]) });
            } catch {
              // A busy provider must not prevent the answer from being delivered.
            }
            title ||= deriveConversationTitle(content);
            if (title) {
              const renamed = await renameConversation(conversationId, title, auth.accessToken);
              if (renamed.data) controller.enqueue(event("title", { title: renamed.data.title }));
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
