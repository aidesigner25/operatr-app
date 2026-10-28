type ServerEnvironment = {
  nodeEnv: "development" | "test" | "production";
  appUrl?: string;
  supabase: { url?: string; publishableKey?: string; serviceRoleKey?: string };
  encryptionSecret?: string;
};

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Reads server configuration without exposing secret values to the client. */
export function getServerEnvironment(): ServerEnvironment {
  const rawNodeEnv = process.env.NODE_ENV;
  const nodeEnv = rawNodeEnv === "production" || rawNodeEnv === "test" ? rawNodeEnv : "development";
  return {
    nodeEnv,
    appUrl: optional("NEXT_PUBLIC_APP_URL"),
    supabase: {
      url: optional("NEXT_PUBLIC_SUPABASE_URL"),
      publishableKey: optional("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      serviceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    },
    encryptionSecret: optional("OPERATR_KEY_ENCRYPTION_SECRET"),
  };
}

export function assertSupabaseServerConfiguration(): void {
  const environment = getServerEnvironment();
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", environment.supabase.url],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", environment.supabase.publishableKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Supabase server configuration is incomplete: ${missing.join(", ")}`);
}

export function assertCredentialVaultConfiguration(): void {
  if (!getServerEnvironment().encryptionSecret) {
    throw new Error("OPERATR_KEY_ENCRYPTION_SECRET must be configured before storing credentials.");
  }
}
