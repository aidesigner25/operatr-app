import "server-only";

export const CHAT_PROVIDERS = ["openai", "anthropic", "google", "xai"] as const;
export type ChatProvider = (typeof CHAT_PROVIDERS)[number];

export const RESPONSE_STYLES = ["concise", "medium", "deep"] as const;
export type ResponseStyle = (typeof RESPONSE_STYLES)[number];

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export const MODEL_OPTIONS: Record<ChatProvider, { id: string; label: string }[]> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  google: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  xai: [
    { id: "grok-4", label: "Grok 4" },
    { id: "grok-3-mini", label: "Grok 3 Mini" },
  ],
};

export function isChatProvider(value: unknown): value is ChatProvider {
  return typeof value === "string" && (CHAT_PROVIDERS as readonly string[]).includes(value);
}

export function isResponseStyle(value: unknown): value is ResponseStyle {
  return typeof value === "string" && (RESPONSE_STYLES as readonly string[]).includes(value);
}

export function isAllowedModel(provider: ChatProvider, model: unknown): model is string {
  if (typeof model !== "string") return false;
  const trimmed = model.trim();
  if (!/^[a-zA-Z0-9._:-]{1,200}$/.test(trimmed)) return false;
  return MODEL_OPTIONS[provider].some((option) => option.id === trimmed)
    || /^custom:[a-zA-Z0-9._:-]{1,192}$/.test(trimmed);
}

export function resolvedModel(model: string): string {
  return model.startsWith("custom:") ? model.slice("custom:".length) : model;
}

export function providerSystemInstruction(style: ResponseStyle): string {
  const depth = {
    concise: "Be direct and concise. Use only the detail needed to answer the request.",
    medium: "Be clear and practical. Structure the answer around decisions, evidence, and next actions.",
    deep: "Give a rigorous strategic analysis. State assumptions, tradeoffs, risks, and prioritized next actions.",
  }[style];
  return `You are Operatr, a private research and operations copilot. ${depth} Do not claim to have used tools, browsed the web, accessed files, or performed actions unless those capabilities were explicitly supplied in this conversation.`;
}
