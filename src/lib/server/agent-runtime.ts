import "server-only";

import type { ChatMessage, ResponseStyle } from "@/lib/server/chat-types";
import { ChatRuntimeError } from "@/lib/server/chat-provider";

export const AGENT_RUNTIME_TIMEOUT_MS = 90_000;
export const AGENT_RUNTIME_CONTEXT_CHAR_LIMIT = 36_000;

export type AgentRunStatus = "running" | "completed" | "cancelled" | "failed" | "timed_out";
export type AgentTraceStage = "preparing" | "generating" | "retrying" | "saving" | "completed" | "cancelled" | "failed" | "timed_out";

const OUTPUT_LIMITS: Record<ResponseStyle, number> = {
  concise: 800,
  medium: 2_000,
  deep: 4_000,
};

export function maxOutputTokensFor(style: ResponseStyle) {
  return OUTPUT_LIMITS[style];
}

/** Keeps an entire user message and the newest usable exchange history inside a fixed provider budget. */
export function boundedProviderMessages(messages: ChatMessage[]) {
  const kept: ChatMessage[] = [];
  let remaining = AGENT_RUNTIME_CONTEXT_CHAR_LIMIT;
  for (const message of [...messages].reverse()) {
    if (message.content.length > remaining) {
      if (kept.length === 0) kept.unshift({ ...message, content: message.content.slice(-remaining) });
      break;
    }
    kept.unshift(message);
    remaining -= message.content.length;
  }
  return kept;
}

export function isSafeRetryable(error: unknown) {
  if (error instanceof ChatRuntimeError) return error.retryable;
  return error instanceof TypeError;
}

export function runStatusFor(error: unknown, timedOut: boolean): AgentRunStatus {
  if (timedOut) return "timed_out";
  if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
  return "failed";
}
