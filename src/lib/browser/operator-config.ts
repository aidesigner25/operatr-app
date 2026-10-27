/**
 * Temporary browser preferences for the POC UI.
 * Credentials are deliberately stripped from legacy localStorage data.
 */
export type OperatorConfig = Record<string, unknown>;

const CONFIG_KEY = "operatr_user_config";
const SENSITIVE_FIELDS = new Set([
  "primaryKey", "fallbackKey", "openai", "anthropic", "google", "xai",
  "tavilyKey", "apifyKey", "tavily", "apify",
]);

function isRecord(value: unknown): value is OperatorConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeOperatorConfig(config: OperatorConfig): OperatorConfig {
  const sanitized: OperatorConfig = {};
  let removedCredential = false;

  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_FIELDS.has(key)) {
      removedCredential = true;
      continue;
    }
    sanitized[key] = value;
  }

  if (removedCredential) {
    sanitized.hasActiveKeys = false;
    sanitized.needsSecureConnection = true;
  }

  return sanitized;
}

export function readOperatorConfig(): OperatorConfig {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(CONFIG_KEY);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      window.localStorage.removeItem(CONFIG_KEY);
      return {};
    }
    const sanitized = sanitizeOperatorConfig(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    window.localStorage.removeItem(CONFIG_KEY);
    return {};
  }
}

export function writeOperatorConfig(config: OperatorConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(sanitizeOperatorConfig(config)));
}
