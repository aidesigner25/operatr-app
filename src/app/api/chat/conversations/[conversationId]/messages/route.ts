import { attachmentSecurityIssue, decodeAttachmentMessage, encodeAttachmentMessage, validateAttachment } from "@/lib/shared/chat-attachment";
import { createRequestId, jsonError } from "@/lib/server/http";
import { getAuthenticatedRequest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
import { createAgentRun, finishAgentRun, getConversation, listMessages, renameConversationIfUnchanged, saveAgentTraceEvent, saveMessage, titleFor, toProviderMessages, touchConversation } from "@/lib/server/chat-store";
import { ChatRuntimeError, deriveConversationTitle, generateConversationTitle, loadProviderCredential, streamProviderResponse } from "@/lib/server/chat-provider";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { AGENT_RUNTIME_TIMEOUT_MS, MODEL_RESPONSE_TIMEOUT_MS, TITLE_TIMEOUT_MS, boundedProviderMessages, isSafeRetryable, maxOutputTokensFor, runStatusFor, type AgentTraceStage } from "@/lib/server/agent-runtime";
import { loadOperatorPreferences, operatorSystemInstruction } from "@/lib/server/operator-profile";
import { searchTavily, tavilyResearchInstruction, type TavilySource } from "@/lib/server/tavily";
import { apifyResearchInstruction, runApifyTask, selectApifyTask, resolveApifyPrompt } from "@/lib/server/apify";
import { assessValue, type AssessmentResult } from "@/lib/server/value-assessment";
import { requestedGoogleAsset } from "@/lib/shared/google-asset-intent";
import { exportGoogleResponse, GoogleExportError } from "@/lib/server/google-export";
import { joinContinuationMarkdown } from "@/lib/shared/continuation-markdown";
import { continuationTask } from "@/lib/shared/task-continuation";
import { researchSourceSuffix } from "@/lib/server/research-source-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ conversationId: string }> };
type MessageBody = { content?: unknown; useWeb?: unknown; useApify?: unknown; attachment?: unknown };
const encoder = new TextEncoder();
// Leave room under the database's 50,000-character message limit for an
// optional Google file status/link appended after the model response.
const MAX_MODEL_RESPONSE_CHARS = 49_000;
const MAX_GOOGLE_STATUS_CHARS = 1_000;

function event(type: string, data: Record<string, unknown>) {
  return encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Hold a short opening and the tail of each chunk so tool markup split across
// tokens never reaches chat. Once real output starts, continue streaming.
async function* guardResearchOutput(stream: AsyncIterable<string>) {
  let pending = "";
  let started = false;
  try {
    for await (const delta of stream) {
      pending += delta;
      if (/<\s*(?:tool_call|function_call|tool_use)\b/i.test(pending)) throw new ChatRuntimeError("provider_unavailable_tool", "The model attempted an unavailable tool instead of completing the response. Please retry or choose another model.", 502);
      if (!started && pending.length < 512) continue;
      started = true;
      if (pending.length > 32) { yield pending.slice(0, -32); pending = pending.slice(-32); }
    }
  } catch (error) {
    // Preserve useful partial answers on timeouts or length limits, but never
    // deliver a model's attempted tool invocation as user-facing text.
    if (!(error instanceof ChatRuntimeError && error.code === "provider_unavailable_tool") && pending) yield pending;
    throw error;
  }
  if (pending) yield pending;
}

async function readBoundedBody(request: Request) {
  const maximum = 512_000;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { void reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as MessageBody;
  } catch { return null; }
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const { conversationId } = await context.params;
  if (!getFeatureFlags().chat) return jsonError("chat_disabled", "Chat is not enabled for this environment yet.", requestId, 503);
  if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected an application/json request.", requestId, 415);

  const body = await readBoundedBody(request);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 50_000) return jsonError("invalid_message", "Enter a message up to 50,000 characters.", requestId, 400);
  const attachment = body?.attachment == null ? null : validateAttachment(body.attachment);
  if (body?.attachment != null && !attachment) return jsonError("invalid_attachment", "Use a nonempty TXT, MD, CSV, JSON, or extracted PDF attachment up to 20,000 characters.", requestId, 400);
  if (attachment && attachmentSecurityIssue(attachment.text)) return jsonError("unsafe_attachment", "This file contains instructions that attempt to control the assistant or expose secrets. Remove that content and try again.", requestId, 400);
  const storedContent = attachment ? encodeAttachmentMessage(content, attachment) : content;
  if (!storedContent) return jsonError("invalid_attachment", "The message and attachment exceed the allowed combined size. Shorten the message or file.", requestId, 400);
  if (body?.useWeb !== undefined && typeof body.useWeb !== "boolean") return jsonError("invalid_research_request", "Invalid live web research setting.", requestId, 400);
  if (body?.useApify !== undefined && typeof body.useApify !== "boolean") return jsonError("invalid_research_request", "Invalid Apify research setting.", requestId, 400);

  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!await allowRequest(`chat:send:${auth.user.id}`, 20, 60_000)) return jsonError("rate_limited", "Too many messages. Try again shortly.", requestId, 429);
    const conversation = await getConversation(conversationId, auth.accessToken);
    if (conversation.error) return jsonError("chat_unavailable", "The conversation could not be loaded.", requestId, 503);
    if (!conversation.data) return jsonError("not_found", "Conversation not found.", requestId, 404);
    const priorHistory = await listMessages(conversationId, auth.accessToken);
    if (priorHistory.error) return jsonError("chat_unavailable", "Conversation history could not be loaded.", requestId, 503);
    const task = continuationTask([...priorHistory.data, { role: "user", content: storedContent, status: "completed" }]);
    const assetKind = requestedGoogleAsset(task.prompt);
    const useWeb = body?.useWeb === true && !task.isContinuation;
    const useApify = body?.useApify === true && !task.isContinuation;
    const apifyPrompt = resolveApifyPrompt(content, priorHistory.data.filter((item) => item.role === "user").map((item) => decodeAttachmentMessage(item.content)?.prompt || item.content));
    const apifyTask = useApify ? selectApifyTask(apifyPrompt) : null;
    const requestsLinkedInScan = /\blinkedin\b/i.test(content) && /\b(?:scan|scrape|research|posts?|posting|activity|updates?)\b/i.test(content);
    if (requestsLinkedInScan && !useApify && !task.isContinuation) return jsonError("apify_not_enabled", "Turn on Apify research for the requested LinkedIn scan, then resend your message.", requestId, 400);
    if (useWeb && !getFeatureFlags().tavily) return jsonError("research_disabled", "Live web research is not enabled for this environment yet.", requestId, 503);
    if (useWeb && !await allowRequest(`tavily:search:${auth.user.id}`, 8, 10 * 60_000)) return jsonError("research_rate_limited", "Live web research is limited to 8 searches per 10 minutes.", requestId, 429);
    if (useApify && !getFeatureFlags().apify) return jsonError("apify_disabled", "Apify research is not enabled for this environment yet.", requestId, 503);
    if (apifyTask && !await allowRequest(`apify:run:${auth.user.id}`, 5, 10 * 60_000)) return jsonError("apify_rate_limited", "Apify research is limited to 5 runs per 10 minutes.", requestId, 429);

    // Validate every requested recipient before persisting the user message. A missing
    // Tavily connection should never create an unanswered message in the conversation.
    const credential = await loadProviderCredential({ userId: auth.user.id, provider: conversation.data.provider, accessToken: auth.accessToken });
    const tavilyCredential = useWeb
      ? await loadProviderCredential({ userId: auth.user.id, provider: "tavily", accessToken: auth.accessToken })
      : null;
    const apifyCredential = apifyTask
      ? await loadProviderCredential({ userId: auth.user.id, provider: "apify", accessToken: auth.accessToken })
      : null;

    const userMessage = await saveMessage({ conversationId, userId: auth.user.id, role: "user", content: storedContent, status: "completed" }, auth.accessToken);
    if (userMessage.error) return jsonError("chat_unavailable", "Your message could not be saved.", requestId, 503);
    const history = await listMessages(conversationId, auth.accessToken);
    if (history.error) return jsonError("chat_unavailable", "Conversation history could not be loaded.", requestId, 503);
    const opening = history.data.find((message) => message.role === "user")?.content || content;
    const openingPrompt = decodeAttachmentMessage(opening)?.prompt || opening;
    const expectedTitle = conversation.data.title;
    const mayGenerateTitle = expectedTitle === titleFor(openingPrompt) || expectedTitle === deriveConversationTitle(openingPrompt);
    const preferences = await loadOperatorPreferences(auth.user.id, auth.accessToken);
    const systemInstruction = operatorSystemInstruction(conversation.data.response_style, preferences);
    const providerMessages = boundedProviderMessages(toProviderMessages(history.data));
    if (task.segments.length && providerMessages.length) {
      providerMessages[providerMessages.length - 1] = { role: "user", content: `Continue the interrupted response without repeating completed sections. Original request: ${JSON.stringify(task.prompt.slice(0, 4000))}` };
    }
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
        let toolRetryCount = 0;
        let continuationCount = 0;
        let retryAfterEmptyOutputLimit = false;
        let failure: unknown;
        let sources: TavilySource[] = [];
        let apifySources = 0;
        let retrievedSources: { title: string; url?: string }[] = [];
        let researchFailure = false;
        let assetDelivery: { kind: "doc" | "sheet"; status: "created" | "unconfirmed" } | undefined;
        const timeout = AbortSignal.timeout(AGENT_RUNTIME_TIMEOUT_MS);
        const signal = AbortSignal.any([request.signal, timeout]);
        let modelTimeout: AbortSignal | null = null;
        let titlePromise: Promise<string | null> | null = null;
        const beginTitle = () => {
          if (!mayGenerateTitle || titlePromise || request.signal.aborted) return;
          const titleSignal = AbortSignal.any([request.signal, AbortSignal.timeout(TITLE_TIMEOUT_MS)]);
          titlePromise = (async () => {
            for (let attempt = 0; attempt < 2 && !titleSignal.aborted; attempt++) {
              try {
                const title = await generateConversationTitle({ provider: conversation.data!.provider, model: conversation.data!.model, credential, openingMessage: openingPrompt.slice(0, 5_000), signal: titleSignal });
                if (title) return title;
              } catch (error) {
                if (titleSignal.aborted || !isSafeRetryable(error)) return null;
              }
              if (attempt === 0 && !titleSignal.aborted) await new Promise<void>((resolve) => setTimeout(resolve, 400));
            }
            return null;
          })().catch(() => null);
        };
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
          if (assetKind) await trace("preparing", `Google ${assetKind === "doc" ? "Doc" : "Sheet"} requested; creation starts after the response is complete`);
          if (assetKind) requestSystemInstruction += `\n\nThe user requested a Google ${assetKind === "sheet" ? "Sheet" : "Doc"}. Operatr, not you, will automatically attempt to create the file from your complete response after generation and provide the result or error in chat. Produce the requested content in a format suitable for that file. Do not claim a file already exists or invent its link. Do not say file creation is unavailable, say no link will be provided, or tell the user to copy content manually. Do not speculate about the creation outcome; Operatr reports it separately.`;
          if (!useWeb && !useApify && !task.isContinuation) {
            requestSystemInstruction += "\n\nNo fresh research tools were run for this message. Do not claim to search or use current evidence that was not supplied. If fresh research is needed, explain that Live web or Apify must be enabled.";
          }
          if (task.isContinuation) {
            await trace("preparing", "Continuing the previous response without a new search");
            requestSystemInstruction += "\n\nThis is a continuation. No new research was run. Use available conversation evidence and links; do not invent sources or imply new research was performed.";
          }
          if (useWeb || useApify) {
            requestSystemInstruction += "\n\nResearch tools are operated by Operatr before your response. You cannot call additional tools in this response. Do not emit tool calls or say you will search. Write the requested answer now using the supplied evidence, citing sources where supported, and clearly identify any missing evidence.";
            // Use research wait time for naming without competing with the answer stream.
            beginTitle();
            if (useWeb && tavilyCredential) await trace("preparing", "Searching live web with Tavily");
            if (apifyTask && apifyCredential) await trace("preparing", `Selected Apify ${apifyTask.replace("_", " ")} research`);
            if (useApify && !apifyTask) await trace("preparing", "Apify research needs a clearer target");
            const [tavilyOutcome, apifyOutcome] = await Promise.all([
              useWeb && tavilyCredential ? searchTavily({ query: content, credential: tavilyCredential, signal }).then((result) => ({ result, error: false })).catch((error: unknown) => { if (signal.aborted) throw error; return { result: null, error: true }; }) : Promise.resolve({ result: null, error: false }),
              apifyTask && apifyCredential
                ? runApifyTask({ task: apifyTask, prompt: apifyPrompt, credential: apifyCredential, signal })
                  .then((result) => ({ result, error: null }))
                  .catch((error: unknown) => {
                    if (signal.aborted) throw error;
                    return { result: null, error };
                  })
                : Promise.resolve({ result: null, error: null }),
            ]);
            if (tavilyOutcome.error) {
              await trace("preparing", "Live web search failed; continuing with available research");
              requestSystemInstruction += "\n\nLive web search failed. Do not claim fresh web research was completed; explain the limitation.";
            }
            if (tavilyOutcome.result) {
              const tavilyResult = tavilyOutcome.result;
              sources = tavilyResult;
              retrievedSources.push(...tavilyResult);
              requestSystemInstruction += tavilyResearchInstruction(sources);
              controller.enqueue(event("research", { sourceCount: sources.length, sources: sources.map(({ title, url }) => ({ title, url })) }));
              await trace("preparing", sources.length ? `Found ${sources.length} web sources` : "No web sources were returned");
            }
            if (apifyOutcome.result) {
              const { result: apifyResult } = apifyOutcome;
              apifySources = apifyResult.sources.length;
              retrievedSources.push(...apifyResult.sources);
              if (apifyResult.sources.length) requestSystemInstruction += apifyResearchInstruction(apifyResult.label, apifyResult.sources);
              controller.enqueue(event("research", { sourceCount: apifyResult.sources.length, sources: apifyResult.sources.map(({ title, url }) => ({ title, url })) }));
              await trace("preparing", apifyResult.sources.length ? `Found ${apifyResult.sources.length} Apify sources${apifyResult.incomplete ? " before the response window closed" : ""}` : "Apify returned no usable evidence in time");
              if (apifyResult.incomplete) requestSystemInstruction += "\n\nThe requested Apify run did not finish within the research window. The available results may be incomplete; explain this limitation clearly and do not imply that missing competitors were researched.";
              if (!apifyResult.sources.length) requestSystemInstruction += "\n\nThe requested Apify run returned no usable evidence for this request before its response window closed. Tell the user the research timed out or returned no usable results. Do not claim the user needs to enable a capability that was already enabled, and do not present earlier conversation evidence as the new research.";
              if (!apifyResult.sources.length && !sources.length) {
                researchFailure = true;
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
                researchFailure = true;
                answer = apifyOutcome.error instanceof ChatRuntimeError && apifyOutcome.error.code === "apify_target_required"
                  ? apifyOutcome.error.message
                  : "The research tool could not complete this request. Please try again; if the issue persists, check your Apify connection and account limits.";
                controller.enqueue(event("delta", { text: answer }));
                completed = true;
              }
            }
          }
          if (!completed) modelTimeout = AbortSignal.timeout(MODEL_RESPONSE_TIMEOUT_MS);
          const modelSignal = modelTimeout ? AbortSignal.any([signal, modelTimeout]) : signal;
          while (!completed) {
            let emittedText = false;
            await trace("generating", continuationCount ? "Continuing the response" : retryCount ? "Retrying the selected model" : "Generating with the selected model");
            try {
              const responseStream = streamProviderResponse({
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
                signal: modelSignal,
                maxTokens: retryAfterEmptyOutputLimit ? Math.min(maxOutputTokens * 2, 8_000) : maxOutputTokens,
                lowReasoningEffort: retryAfterEmptyOutputLimit,
              });
              for await (const delta of (/<\s*(?:tool_call|function_call|tool_use)\b/i.test(content) ? responseStream : guardResearchOutput(responseStream))) {
                const remaining = MAX_MODEL_RESPONSE_CHARS - answer.length;
                if (delta.length > remaining) {
                  let partial = delta.slice(0, Math.max(0, remaining));
                  // Avoid cutting a Unicode surrogate pair in half at the boundary.
                  if (partial && /[\uD800-\uDBFF]/.test(partial.at(-1)!) && /[\uDC00-\uDFFF]/.test(delta.charAt(partial.length))) partial = partial.slice(0, -1);
                  if (partial) { emittedText = true; answer += partial; controller.enqueue(event("delta", { text: partial })); }
                  throw new ChatRuntimeError("provider_response_too_large", "The response reached its size limit. Please ask to continue.", 502);
                }
                emittedText = true;
                answer += delta;
                controller.enqueue(event("delta", { text: delta }));
              }
              if (!answer.trim()) throw new ChatRuntimeError("provider_empty_response", "The selected model returned no text. Please try again or choose another model.", 502, true);
              failure = undefined;
              completed = true;
            } catch (caught) {
              failure = caught;
              if (caught instanceof ChatRuntimeError && caught.code === "provider_unavailable_tool" && !answer.trim() && toolRetryCount === 0 && !modelSignal.aborted) {
                toolRetryCount++;
                requestSystemInstruction += "\n\nYour previous attempt incorrectly tried to call a tool. No more tools are available. Do not output tool syntax or promise to search. Answer the original request directly using the evidence already supplied.";
                await trace("retrying", "Retrying the response without unsupported tool calls");
                continue;
              }
              if (caught instanceof ChatRuntimeError && caught.code === "provider_output_limit" && !answer.trim() && retryCount === 0 && !modelSignal.aborted) {
                retryCount = 1;
                retryAfterEmptyOutputLimit = true;
                await trace("retrying", "Retrying after the model returned no visible text");
                continue;
              }
              if (caught instanceof ChatRuntimeError && caught.code === "provider_output_limit" && answer.trim() && continuationCount < 2 && !modelSignal.aborted) {
                continuationCount += 1;
                continue;
              }
              if (caught instanceof ChatRuntimeError && caught.code === "provider_output_limit") {
                failure = new ChatRuntimeError("provider_output_limit", answer.trim() ? "The response reached its length limit before it could finish. Please ask to continue." : "The model reached its output limit without producing a visible answer. Please try another model or increase the response effort.", 502);
              }
              // A retry may only occur before any provider text reaches the user. It always
              // keeps the same provider and model, so a prompt never changes recipients.
              if (!emittedText && !answer.trim() && retryCount === 0 && !modelSignal.aborted && isSafeRetryable(caught)) {
                retryCount = 1;
                await trace("retrying", "Retrying once before response starts");
                continue;
              }
              break;
            }
          }
          if (answer.trim() && !request.signal.aborted && !researchFailure && retrievedSources.length) {
            const suffix = researchSourceSuffix(retrievedSources, answer);
            if (suffix && answer.length + suffix.length <= MAX_MODEL_RESPONSE_CHARS) { answer += suffix; controller.enqueue(event("delta", { text: suffix })); }
          }
          if (completed && assetKind && !researchFailure && answer.trim() && !request.signal.aborted) {
            await trace("saving", `Creating requested Google ${assetKind === "doc" ? "Doc" : "Sheet"}`);
            let note: string;
            try {
              if (!getFeatureFlags().googleWorkspace) throw new GoogleExportError("Google Workspace is not enabled.", 503);
              const target = task.prompt.match(/\b(?:but|instead|this time|now)\s+for\s+([\p{L}\p{N}&.'’ -]{2,80}?)(?=[?.!,;]|$)/iu)?.[1]?.trim();
              const assetTitle = target ? `${target.charAt(0).toUpperCase()}${target.slice(1)} report` : conversation.data!.title;
              const file = await exportGoogleResponse({ kind: assetKind, title: assetTitle, content: joinContinuationMarkdown([...task.segments, answer]), userId: auth.user.id, accessToken: auth.accessToken });
              assetDelivery = { kind: assetKind, status: file.partial ? "unconfirmed" : "created" };
              note = file.partial ? `\n\nGoogle file creation was only partially confirmed. [Open the file](${file.url}).` : `\n\n[Open the created Google ${assetKind === "doc" ? "Doc" : "Sheet"}](${file.url})`;
            } catch (caught) {
              assetDelivery = { kind: assetKind, status: "unconfirmed" };
              const message = caught instanceof GoogleExportError ? caught.message : "Google did not confirm file creation. Check Drive before trying again.";
              const partial = caught instanceof GoogleExportError && caught.partialUrl ? ` [Open the file](${caught.partialUrl}).` : "";
              note = `\n\nGoogle file creation could not be confirmed: ${message}${partial}`;
            }
            const boundedNote = note.slice(0, MAX_GOOGLE_STATUS_CHARS);
            answer += boundedNote;
            controller.enqueue(event("delta", { text: boundedNote }));
          }
          if (!completed && (timeout.aborted || modelTimeout?.aborted || !(failure instanceof DOMException && failure.name === "AbortError"))) {
            const timedOut = (timeout.aborted || modelTimeout?.aborted) && !request.signal.aborted;
            const message = timedOut
              ? modelTimeout?.aborted ? "The selected model exceeded its 120-second response window. The response was interrupted." : "The overall run reached its time limit. The response was interrupted."
              : failure instanceof ChatRuntimeError ? failure.message : "The provider could not complete this request.";
            controller.enqueue(event("error", { code: timedOut ? "runtime_timeout" : failure instanceof ChatRuntimeError ? failure.code : "provider_error", message }));
          }
        } finally {
          const status = completed ? "completed" : runStatusFor(failure, (timeout.aborted || Boolean(modelTimeout?.aborted)) && !request.signal.aborted);
          await trace("saving", "Saving the run record");
          let assessment: Promise<AssessmentResult> | null = null;
          let assessmentMessageId: string | null = null;
          if (answer.trim()) {
            const saved = await saveMessage({
              conversationId,
              userId: auth.user.id,
              role: "assistant",
              content: answer,
              status: completed ? "completed" : "cancelled",
            }, auth.accessToken);
            if (saved.data?.[0]?.id) {
              controller.enqueue(event("saved", { messageId: saved.data[0].id }));
              if (completed && !researchFailure && !request.signal.aborted) {
                assessmentMessageId = saved.data[0].id;
                assessment = assessValue({ userId: auth.user.id, accessToken: auth.accessToken, messageId: saved.data[0].id, conversationId, provider: conversation.data!.provider, model: conversation.data!.model, responseStyle: conversation.data!.response_style, credential, prompt: task.prompt, answer, assetDelivery, previousSegments: task.segments, recentContext: history.data.slice(-5, -1).map((item) => `${item.role}: ${item.content.slice(0, 600)}`).join("\n"), research: `Tavily sources: ${sources.length}; Apify sources: ${apifySources}.`, signal: request.signal }).catch(() => ({ status: "model_unavailable" }));
              }
            }
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
          if (mayGenerateTitle && answer.trim() && !request.signal.aborted) {
            beginTitle();
            let title: string | null = await (titlePromise as Promise<string | null> | null);
            title ||= deriveConversationTitle(openingPrompt);
            if (title) {
              const renamed = await renameConversationIfUnchanged(conversationId, title, expectedTitle, auth.accessToken);
              if (renamed.data) controller.enqueue(event("title", { title: renamed.data.title }));
            }
          }
          await touchConversation(conversationId, auth.accessToken);
          if (assessment && assessmentMessageId) {
            const result = await assessment;
            controller.enqueue(event("assessment", { messageId: assessmentMessageId, outcome: result.status }));
          }
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
