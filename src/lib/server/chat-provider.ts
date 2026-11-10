import "server-only";

import { decryptCredential, type CredentialProvider } from "@/lib/server/vault";
import { supabaseRest } from "@/lib/server/supabase";
import { providerSystemInstruction, resolvedModel, type ChatMessage, type ChatProvider, type ResponseStyle } from "@/lib/server/chat-types";

// Limit a single SSE event and unframed input. The provider can send many
// ordinary events; this is not a cap on the full answer.
const MAX_PROVIDER_EVENT_CHARACTERS = 1_000_000;
const MAX_PROVIDER_CHUNK_BYTES = 2_000_000;

type VaultCredentialRecord = { encrypted_credential: string };
type ProviderInput = {
  provider: ChatProvider;
  model: string;
  messages: ChatMessage[];
  responseStyle: ResponseStyle;
  credential: string;
  signal: AbortSignal;
  systemInstruction?: string;
  maxTokens?: number;
  lowReasoningEffort?: boolean;
};

export class ChatRuntimeError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly retryable = false) {
    super(message);
  }
}

export async function loadProviderCredential(input: { userId: string; provider: ChatProvider | CredentialProvider; accessToken: string }) {
  const result = await supabaseRest<VaultCredentialRecord[]>(
    `vault_credentials?provider=eq.${input.provider}&select=encrypted_credential&limit=1`,
    input.accessToken,
  );
  if (result.error) throw new ChatRuntimeError("vault_unavailable", "The secure vault is unavailable.", 503);
  const record = result.data?.[0];
  if (!record) throw new ChatRuntimeError("provider_not_connected", `Connect a ${input.provider} key in Integrations before starting chat.`, 409);
  try {
    return decryptCredential(record.encrypted_credential, input.userId, input.provider as CredentialProvider);
  } catch {
    throw new ChatRuntimeError("credential_unavailable", "This provider credential needs to be reconnected.", 409);
  }
}

async function providerFetch(url: string, init: RequestInit, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal, cache: "no-store" });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new ChatRuntimeError("provider_network_error", "The provider could not be reached. You can try the same model again.", 502, true);
  }
  if (response.ok && response.body) return response;
  // Upstream error bodies are untrusted and can contain keys, request data,
  // or other details. Give actionable status-based guidance without echoing them.
  const message = response.status === 401 || response.status === 403
    ? "The provider rejected this credential or model access. Check the key and model permissions."
    : response.status === 429
      ? "The provider reported a rate or usage limit. Check your provider account or try again later."
      : response.status === 408
        ? "The provider timed out. Please try again."
        : response.status >= 400 && response.status < 500
          ? "The provider rejected this request. Check the selected model and try again."
          : "The provider could not complete this request. Please try again.";
  const retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
  throw new ChatRuntimeError("provider_error", message, response.status >= 400 && response.status < 500 ? 400 : 502, retryable);
}

function parseProviderEvent(data: string): unknown {
  try { return JSON.parse(data); }
  catch { throw new ChatRuntimeError("provider_stream_error", "The provider sent an invalid streaming response. Please try again.", 502, true); }
}

async function* sseData(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value && value.byteLength > MAX_PROVIDER_CHUNK_BYTES) throw new ChatRuntimeError("provider_stream_error", "The provider sent an oversized streaming response. Please try again.", 502, false);
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      if (buffer.length > MAX_PROVIDER_EVENT_CHARACTERS) throw new ChatRuntimeError("provider_stream_error", "The provider sent an oversized streaming response. Please try again.", 502, false);
      for (const event of events) {
        if (event.length > MAX_PROVIDER_EVENT_CHARACTERS) throw new ChatRuntimeError("provider_stream_error", "The provider sent an oversized streaming response. Please try again.", 502, false);
        const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (data) yield data;
      }
      if (done) { finished = true; break; }
    }
    const trailing = buffer.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (trailing) yield trailing;
  } finally {
    // Metadata callers may stop once a complete answer arrives; release the
    // underlying provider stream instead of leaving it consuming resources.
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function* openAiCompatible(input: ProviderInput, baseUrl: string): AsyncGenerator<string> {
  const response = await providerFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.credential}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolvedModel(input.model),
      stream: true,
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      ...(input.provider === "openrouter" && input.lowReasoningEffort ? { reasoning: { effort: "low" } } : {}),
      messages: [{ role: "system", content: input.systemInstruction || providerSystemInstruction(input.responseStyle) }, ...input.messages],
    }),
  }, input.signal);
  let completed = false;
  for await (const data of sseData(response)) {
    if (data === "[DONE]") return;
    const parsed = parseProviderEvent(data) as { error?: { message?: unknown }; choices?: { delta?: { content?: string | null; tool_calls?: unknown; function_call?: unknown }; finish_reason?: string | null }[] };
    if (parsed.error) throw new ChatRuntimeError("provider_stream_error", "The model provider reported an error while streaming. Please try again.", 502, true);
    if (parsed.choices?.[0]?.delta?.tool_calls || parsed.choices?.[0]?.delta?.function_call) throw new ChatRuntimeError("provider_unavailable_tool", "The model tried to use a tool that is not available in this response. Please retry or choose another model.", 502);
    const text = parsed.choices?.[0]?.delta?.content;
    if (text) yield text;
    const reason = parsed.choices?.[0]?.finish_reason;
    if (reason === "length") throw new ChatRuntimeError("provider_output_limit", "The response reached the model's output limit.", 502);
    if (reason === "stop") completed = true;
    else if (reason) throw new ChatRuntimeError("provider_incomplete_stream", "The provider stopped before completing the response. The response may be incomplete.", 502);
  }
  if (!completed) throw new ChatRuntimeError("provider_incomplete_stream", "The connection ended before the provider confirmed the response was complete. The response may be incomplete.", 502, true);
}

async function* anthropicStream(input: ProviderInput): AsyncGenerator<string> {
  const response = await providerFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": input.credential,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel(input.model),
      max_tokens: input.maxTokens || 4096,
      stream: true,
      system: input.systemInstruction || providerSystemInstruction(input.responseStyle),
      messages: input.messages,
    }),
  }, input.signal);
  let completed = false;
  for await (const data of sseData(response)) {
    const parsed = parseProviderEvent(data) as { type?: string; delta?: { text?: string; stop_reason?: string }; error?: { message?: string } };
    if (parsed.type === "error") throw new ChatRuntimeError("provider_stream_error", "The model provider reported an error while streaming. Please try again.", 502, true);
    if (parsed.type === "content_block_delta" && parsed.delta?.text) yield parsed.delta.text;
    if (parsed.type === "message_delta" && parsed.delta?.stop_reason === "max_tokens") throw new ChatRuntimeError("provider_output_limit", "The response reached the model's output limit.", 502);
    if (parsed.type === "message_stop" || (parsed.type === "message_delta" && ["end_turn", "stop_sequence"].includes(parsed.delta?.stop_reason || ""))) completed = true;
  }
  if (!completed) throw new ChatRuntimeError("provider_incomplete_stream", "The connection ended before the provider confirmed the response was complete. The response may be incomplete.", 502, true);
}

async function* geminiStream(input: ProviderInput): AsyncGenerator<string> {
  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel(input.model))}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": input.credential, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemInstruction || providerSystemInstruction(input.responseStyle) }] },
      generationConfig: {
        ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
        // Gemini 3.8 defaults to medium thinking, which can exhaust a bounded
        // interactive response window before it emits user-visible text.
        thinkingConfig: { thinkingLevel: "low" },
      },
      contents: input.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    }),
  }, input.signal);
  let completed = false;
  for await (const data of sseData(response)) {
    const parsed = parseProviderEvent(data) as { error?: unknown; candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
    if (parsed.error) throw new ChatRuntimeError("provider_stream_error", "The model provider reported an error while streaming. Please try again.", 502, true);
    for (const part of parsed.candidates?.[0]?.content?.parts || []) if (part.text) yield part.text;
    if (parsed.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new ChatRuntimeError("provider_output_limit", "The response reached the model's output limit.", 502);
    const reason = parsed.candidates?.[0]?.finishReason;
    if (reason === "STOP") completed = true;
    else if (reason && reason !== "FINISH_REASON_UNSPECIFIED") throw new ChatRuntimeError("provider_incomplete_stream", "The provider stopped before completing the response. The response may be incomplete.", 502);
  }
  if (!completed) throw new ChatRuntimeError("provider_incomplete_stream", "The connection ended before the provider confirmed the response was complete. The response may be incomplete.", 502, true);
}

/** Provider-neutral text stream. No tool calls, file uploads, or provider fallback occur here. */
export function streamProviderResponse(input: ProviderInput): AsyncIterable<string> {
  switch (input.provider) {
    case "openai": return openAiCompatible(input, "https://api.openai.com/v1");
    case "xai": return openAiCompatible(input, "https://api.x.ai/v1");
    case "openrouter": return openAiCompatible(input, "https://openrouter.ai/api/v1");
    case "anthropic": return anthropicStream(input);
    case "google": return geminiStream(input);
  }
}

function cleanConversationTitle(value: string) {
  const title = value
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!:;]+$/g, "")
    .trim();
  const words = title.split(" ").filter(Boolean);
  if (words.length < 3 || words.length > 6 || title.length > 80) return null;
  return title;
}

function titleCase(value: string) {
  return value.split(/(\s+)/).map((part, index) => {
    const known: Record<string, string> = { openai: "OpenAI", xai: "xAI", nvidia: "NVIDIA", linkedin: "LinkedIn", api: "API", ai: "AI" };
    const lower = part.toLowerCase();
    if (known[lower]) return known[lower];
    if (index > 0 && /^(and|or|of|the|a|an|in|on|for|to|with|from|vs)$/i.test(part)) return lower;
    if (/[A-Z]/.test(part.slice(1))) return part;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join("");
}

/**
 * A no-network fallback keeps titles consistent even when a free or busy model
 * cannot spare a second completion just to name the chat.
 */
export function deriveConversationTitle(openingMessage: string) {
  const normalized = openingMessage
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/^(?:thank you|thanks)[,!\s]*/i, "")
    .replace(/^(?:please\s+)?(?:can|could|would)\s+you\s+/i, "")
    .replace(/^(?:tell|show|give)\s+me\s+(?:a bit\s+)?(?:about|of|on)\s+/i, "")
    .replace(/^(?:please\s+)?(?:tell|show|give|help|walk)\s+me\s+(?:about|through|with)?\s*/i, "")
    .replace(/^(?:can|could|would)\s+you\s+/i, "")
    .replace(/^i\s+(?:need|want|would\s+like)\s+(?:to\s+)?/i, "")
    .replace(/^what\s+(?:is|are)\s+/i, "")
    .replace(/\band\s+(?:help\s+)?(?:unpack|explain|analy[sz]e)\s+(?:their|its|the)\s+/i, "and ")
    .replace(/[’']s\b/gi, "")
    .replace(/[?!.,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.replace(/^compare\b/i, "Comparing").split(" ").filter(Boolean);
  const title = words.slice(0, 5).join(" ");
  return cleanConversationTitle(titleCase(title));
}

/** Generates a compact, user-visible title after the first completed exchange. */
export async function generateConversationTitle(input: {
  provider: ChatProvider;
  model: string;
  credential: string;
  openingMessage: string;
  signal: AbortSignal;
}) {
  const instruction = "Create a descriptive, natural 3 to 6 word title for this chat in Title Case. Preserve brand capitalization, such as OpenAI and xAI. Capture the main topic and intent, not filler or a full sentence. For example, a request comparing Anthropic and xAI pricing becomes Comparing Anthropic and xAI Pricing. Return only the title without quotation marks or ending punctuation.";
  let output = "";
  for await (const delta of streamProviderResponse({
    ...input,
    responseStyle: "concise",
    maxTokens: 256,
    lowReasoningEffort: true,
    systemInstruction: instruction,
    messages: [{ role: "user", content: input.openingMessage }],
  })) {
    output += delta;
    if (output.length > 120) break;
  }
  const title = cleanConversationTitle(output);
  return title ? titleCase(title) : null;
}
