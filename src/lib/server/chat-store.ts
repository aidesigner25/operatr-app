import "server-only";

import { supabaseRest } from "@/lib/server/supabase";
import type { ChatMessage, ChatProvider, ChatRole, ResponseStyle } from "@/lib/server/chat-types";
import type { AgentRunStatus, AgentTraceStage } from "@/lib/server/agent-runtime";

export type ConversationRecord = {
  id: string;
  title: string;
  provider: ChatProvider;
  model: string;
  response_style: ResponseStyle;
  created_at: string;
  updated_at: string;
};

type MessageRecord = {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  status: "streaming" | "completed" | "cancelled" | "failed";
  created_at: string;
};

type AgentRunRecord = { id: string };

function titleFor(content: string) {
  const normalized = content
    .replace(/\s+/g, " ")
    .replace(/^(?:please\s+)?(?:can|could|would)\s+you\s+/i, "")
    .replace(/^i\s+need\s+(?:help\s+)?(?:with\s+)?/i, "")
    .replace(/^i\s+(?:want|would\s+like)\s+(?:to\s+)?/i, "")
    .replace(/^help\s+me\s+(?:to\s+)?/i, "")
    .trim();
  const words = normalized.split(" ").filter(Boolean).slice(0, 8);
  const label = words.join(" ") || "New conversation";
  return label.length > 56 ? `${label.slice(0, 53).trimEnd()}…` : label;
}

export async function listConversations(accessToken: string) {
  return supabaseRest<ConversationRecord[]>(
    "chat_conversations?select=id,title,provider,model,response_style,created_at,updated_at&order=updated_at.desc&limit=50",
    accessToken,
  );
}

export async function getConversation(id: string, accessToken: string) {
  const response = await supabaseRest<ConversationRecord[]>(
    `chat_conversations?id=eq.${encodeURIComponent(id)}&select=id,title,provider,model,response_style,created_at,updated_at&limit=1`,
    accessToken,
  );
  return { ...response, data: response.data?.[0] || null };
}

export async function createConversation(
  input: { userId: string; provider: ChatProvider; model: string; responseStyle: ResponseStyle; firstMessage: string },
  accessToken: string,
) {
  const response = await supabaseRest<ConversationRecord[]>("chat_conversations", accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: input.userId,
      title: titleFor(input.firstMessage),
      provider: input.provider,
      model: input.model,
      response_style: input.responseStyle,
    }),
  });
  return { ...response, data: response.data?.[0] || null };
}

export async function listMessages(conversationId: string, accessToken: string) {
  const response = await supabaseRest<MessageRecord[]>(
    `chat_messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,conversation_id,role,content,status,created_at&order=created_at.asc&limit=100`,
    accessToken,
  );
  return { ...response, data: response.data || [] };
}

export async function saveMessage(
  input: { conversationId: string; userId: string; role: ChatRole; content: string; status: MessageRecord["status"] },
  accessToken: string,
) {
  return supabaseRest<MessageRecord[]>("chat_messages", accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      status: input.status,
    }),
  });
}

export async function touchConversation(conversationId: string, accessToken: string) {
  return supabaseRest(`chat_conversations?id=eq.${encodeURIComponent(conversationId)}`, accessToken, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  });
}

export async function createAgentRun(input: {
  conversationId: string;
  userId: string;
  provider: ChatProvider;
  model: string;
  responseStyle: ResponseStyle;
  maxOutputTokens: number;
  inputCharacters: number;
}, accessToken: string) {
  const response = await supabaseRest<AgentRunRecord[]>("chat_agent_runs", accessToken, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: input.conversationId,
      user_id: input.userId,
      provider: input.provider,
      model: input.model,
      response_style: input.responseStyle,
      max_output_tokens: input.maxOutputTokens,
      input_characters: input.inputCharacters,
      status: "running",
    }),
  });
  return { ...response, data: response.data?.[0] || null };
}

export async function saveAgentTraceEvent(input: { runId: string; userId: string; stage: AgentTraceStage; detail: string }, accessToken: string) {
  return supabaseRest("chat_agent_run_events", accessToken, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ run_id: input.runId, user_id: input.userId, stage: input.stage, detail: input.detail }),
  });
}

export async function finishAgentRun(input: {
  runId: string;
  status: AgentRunStatus;
  outputCharacters: number;
  retryCount: number;
  errorCode?: string;
}, accessToken: string) {
  return supabaseRest(`chat_agent_runs?id=eq.${encodeURIComponent(input.runId)}`, accessToken, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: input.status,
      output_characters: input.outputCharacters,
      retry_count: input.retryCount,
      error_code: input.errorCode || null,
      completed_at: new Date().toISOString(),
    }),
  });
}

export async function renameConversation(conversationId: string, title: string, accessToken: string) {
  const response = await supabaseRest<ConversationRecord[]>(
    `chat_conversations?id=eq.${encodeURIComponent(conversationId)}`,
    accessToken,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ title }),
    },
  );
  return { ...response, data: response.data?.[0] || null };
}

export async function updateConversationRuntime(
  conversationId: string,
  runtime: { provider: ChatProvider; model: string; responseStyle: ResponseStyle },
  accessToken: string,
) {
  const response = await supabaseRest<ConversationRecord[]>(
    `chat_conversations?id=eq.${encodeURIComponent(conversationId)}`,
    accessToken,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        provider: runtime.provider,
        model: runtime.model,
        response_style: runtime.responseStyle,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return { ...response, data: response.data?.[0] || null };
}

export function toProviderMessages(records: { role: ChatRole; content: string; status: MessageRecord["status"] }[]): ChatMessage[] {
  return records.filter((message) => message.status !== "failed").map(({ role, content }) => ({ role, content }));
}
