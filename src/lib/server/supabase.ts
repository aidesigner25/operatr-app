import "server-only";

import { cookies } from "next/headers";
import { assertSupabaseServerConfiguration, getServerEnvironment } from "@/lib/server/env";

const ACCESS_TOKEN_COOKIE = "operatr-access-token";
const REFRESH_TOKEN_COOKIE = "operatr-refresh-token";

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type AuthenticatedRequest = {
  accessToken: string;
  user: SupabaseUser;
};

type AuthError = { message?: string };

function getSupabaseConfig() {
  assertSupabaseServerConfiguration();
  const { supabase } = getServerEnvironment();
  return { url: supabase.url!, publishableKey: supabase.publishableKey! };
}

export function getSupabaseAuthHeaders(accessToken?: string): HeadersInit {
  const { publishableKey } = getSupabaseConfig();
  return {
    apikey: publishableKey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function getUserFromAccessToken(accessToken: string): Promise<SupabaseUser | null> {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: getSupabaseAuthHeaders(accessToken),
    cache: "no-store",
  });

  if (!response.ok) return null;
  return response.json() as Promise<SupabaseUser>;
}

export async function getAuthenticatedRequest(): Promise<AuthenticatedRequest | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;

  const user = await getUserFromAccessToken(accessToken);
  return user ? { accessToken, user } : null;
}

export function getSessionCookieNames() {
  return { access: ACCESS_TOKEN_COOKIE, refresh: REFRESH_TOKEN_COOKIE };
}

export async function supabaseRest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { url } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...getSupabaseAuthHeaders(accessToken),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as T | AuthError | null;
  if (!response.ok) {
    const message = typeof body === "object" && body && "message" in body
      ? String(body.message || "Supabase request failed")
      : "Supabase request failed";
    return { data: null, error: message, status: response.status };
  }

  return { data: body as T | null, error: null, status: response.status };
}
