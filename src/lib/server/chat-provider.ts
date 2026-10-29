import "server-only";

import { decryptCredential, type CredentialProvider } from "@/lib/server/vault";
import { supabaseRest } from "@/lib/server/supabase";
import { providerSystemInstruction, resolvedModel, type ChatMessage, type ChatProvider, type ResponseStyle } from "@/lib/server/chat-types";

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
};

export class ChatRuntimeError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly retryable = false) {
    super(message);
  }
}

export async function loadProviderCredential(input: { userId: string; provider: ChatProvider; accessToken: string }) {
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
  const body = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
  const message = body?.error?.message || body?.message || "The provider could not complete this request.";
  const retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
  throw new ChatRuntimeError("provider_error", message.slice(0, 300), response.status >= 400 && response.status < 500 ? 400 : 502, retryable);
}

async function* sseData(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) {
      const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (data) yield data;
    }
    if (done) break;
  }
  const trailing = buffer.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  if (trailing) yield trailing;
}

async function* openAiCompatible(input: ProviderInput, baseUrl: string): AsyncGenerator<string> {
  const response = await providerFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.credential}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolvedModel(input.model),
      stream: true,
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      messages: [{ role: "system", content: input.systemInstruction || providerSystemInstruction(input.responseStyle) }, ...input.messages],
    }),
  }, input.signal);
  for await (const data of sseData(response)) {
    if (data === "[DONE]") return;
    const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] };
    const text = parsed.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
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
  for await (const data of sseData(response)) {
    const parsed = JSON.parse(data) as { type?: string; delta?: { text?: string } };
    if (parsed.type === "content_block_delta" && parsed.delta?.text) yield parsed.delta.text;
  }
}

async function* geminiStream(input: ProviderInput): AsyncGenerator<string> {
  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel(input.model))}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": input.credential, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemInstruction || providerSystemInstruction(input.responseStyle) }] },
      ...(input.maxTokens ? { generationConfig: { maxOutputTokens: input.maxTokens } } : {}),
      contents: input.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    }),
  }, input.signal);
  for await (const data of sseData(response)) {
    const parsed = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    for (const part of parsed.candidates?.[0]?.content?.parts || []) if (part.text) yield part.text;
  }
}

/** Provider-neutral text stream. No tool calls, file uploads, or provider fallback occur here. */
export function streamProviderResponse(input: ProviderInput): AsyncIterable<string> {
  switch (input.provider) {
    case "openai": return openAiCompatible(input, "https://api.openai.com/v1");
    case "xai": return openAiCompatible(input, "https://api.x.ai/v1");
    case "anthropic": return anthropicStream(input);
    case "google": return geminiStream(input);
  }
}

function cleanConversationTitle(value: string) {
  const title = value
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!:;]+$/g, "")
    .trim();
  const words = title.split(" ").filter(Boolean);
  if (words.length < 3 || words.length > 6 || title.length > 80) return null;
  return title;
}

/** Generates a compact, user-visible title after the first completed exchange. */
export async function generateConversationTitle(input: {
  provider: ChatProvider;
  model: string;
  credential: string;
  openingMessage: string;
  signal: AbortSignal;
}) {
  const instruction = "Create a concise 3 to 6 word title for this chat. Return only the title, in sentence case, with no quotation marks, colon, or ending punctuation. Capture the user's primary subject rather than answering the request.";
  let output = "";
  for await (const delta of streamProviderResponse({
    ...input,
    responseStyle: "concise",
    maxTokens: 24,
    systemInstruction: instruction,
    messages: [{ role: "user", content: input.openingMessage }],
  })) {
    output += delta;
    if (output.length > 120) break;
  }
  return cleanConversationTitle(output);
}
