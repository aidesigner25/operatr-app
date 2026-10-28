import { NextResponse } from "next/server";
import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getSessionCookieNames, getSupabaseAuthHeaders, getUserFromAccessToken } from "@/lib/server/supabase";
import { assertSupabaseServerConfiguration, getServerEnvironment } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionBody = { access_token?: unknown; refresh_token?: unknown };

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function POST(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError("invalid_content_type", "Expected an application/json request.", requestId, 415);
  }

  const body = await request.json().catch(() => null) as SessionBody | null;
  const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : "";
  if (!accessToken || !refreshToken || accessToken.length > 8_192 || refreshToken.length > 8_192) {
    return jsonError("invalid_session", "The sign-in session is invalid.", requestId, 400);
  }

  try {
    const user = await getUserFromAccessToken(accessToken);
    if (!user) return jsonError("invalid_session", "The sign-in session is invalid.", requestId, 401);

    const response = jsonOk({ user: { id: user.id, email: user.email } }, requestId);
    const names = getSessionCookieNames();
    response.cookies.set(names.access, accessToken, sessionCookieOptions());
    response.cookies.set(names.refresh, refreshToken, sessionCookieOptions());
    return response;
  } catch {
    return jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503);
  }
}

export async function GET(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const cookie = request.headers.get("cookie") || "";
    const { access } = getSessionCookieNames();
    const accessToken = cookie.match(new RegExp(`(?:^|;\\s*)${access}=([^;]+)`))?.[1];
    if (!accessToken) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    const user = await getUserFromAccessToken(decodeURIComponent(accessToken));
    if (!user) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    return jsonOk({ user: { id: user.id, email: user.email, displayName: user.user_metadata?.display_name } }, requestId);
  } catch {
    return jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503);
  }
}

export async function DELETE(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const names = getSessionCookieNames();
  const response = jsonOk({ signedOut: true }, requestId);

  try {
    assertSupabaseServerConfiguration();
    const { supabase } = getServerEnvironment();
    const cookie = request.headers.get("cookie") || "";
    const accessToken = cookie.match(new RegExp(`(?:^|;\\s*)${names.access}=([^;]+)`))?.[1];
    if (accessToken) {
      await fetch(`${supabase.url}/auth/v1/logout`, {
        method: "POST",
        headers: getSupabaseAuthHeaders(decodeURIComponent(accessToken)),
        cache: "no-store",
      });
    }
  } catch {
    // Local session cookies are still cleared when the upstream session has expired or is unavailable.
  }

  response.cookies.set(names.access, "", { ...sessionCookieOptions(), maxAge: 0 });
  response.cookies.set(names.refresh, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
