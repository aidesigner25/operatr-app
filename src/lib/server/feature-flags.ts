export type FeatureFlags = {
  chat: boolean;
  tavily: boolean;
  apify: boolean;
  googleWorkspace: boolean;
};

function readBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

/** Server-only feature switches. Integration-capable features ship disabled. */
export function getFeatureFlags(): FeatureFlags {
  return {
    chat: readBoolean(process.env.OPERATR_ENABLE_CHAT),
    tavily: readBoolean(process.env.OPERATR_ENABLE_TAVILY),
    apify: readBoolean(process.env.OPERATR_ENABLE_APIFY),
    googleWorkspace: readBoolean(process.env.OPERATR_ENABLE_GOOGLE_WORKSPACE),
  };
}
