import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/welcome", "/dashboard", "/agent", "/integrations", "/settings", "/profile", "/api/vault", "/api/chat", "/api/dashboard", "/api/google-workspace", "/api/value-estimates"];
const PROTECTED_PATHS = ["/api"];
const ACCESS_TOKEN_COOKIE = "operatr-access-token";
const REFRESH_TOKEN_COOKIE = "operatr-refresh-token";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

function isProtected(pathname: string) {
  return PROTECTED_PATHS.includes(pathname) || PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Cookie-authenticated browser mutations must originate from the configured app. */
export function validMutationOrigin(request: NextRequest): boolean {
  try {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!configured && process.env.NODE_ENV === "production") return false;
    const app = new URL(configured || request.url);
    if (app.username || app.password || (configured && (app.pathname !== "/" || app.search || app.hash))) return false;
    if (app.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && app.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname))) return false;
    return request.headers.get("origin") === app.origin;
  } catch { return false; }
}

/** Verifies Supabase sessions before a request reaches any protected page or vault API route. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !validMutationOrigin(request)) {
    return NextResponse.json({ error: { code: "invalid_origin", message: "The request origin is invalid." } }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!isProtected(pathname)) return NextResponse.next();

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !publishableKey) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("mode", "signin");
    url.searchParams.set("next", pathname);
    url.searchParams.set("error", "configuration");
    return NextResponse.redirect(url);
  }

  if (accessToken) {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (response.ok) return NextResponse.next();
    } catch {
      // Treat auth transport failures as unauthenticated rather than granting access.
    }
  }

  if (refreshToken) {
    try {
      const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });
      const refreshed = await refreshResponse.json().catch(() => null) as { access_token?: string; refresh_token?: string } | null;
      if (refreshResponse.ok && refreshed?.access_token && refreshed.refresh_token) {
        request.cookies.set(ACCESS_TOKEN_COOKIE, refreshed.access_token);
        request.cookies.set(REFRESH_TOKEN_COOKIE, refreshed.refresh_token);
        const response = NextResponse.next({ request });
        response.cookies.set(ACCESS_TOKEN_COOKIE, refreshed.access_token, sessionCookieOptions());
        response.cookies.set(REFRESH_TOKEN_COOKIE, refreshed.refresh_token, sessionCookieOptions());
        return response;
      }
    } catch {
      // A failed refresh falls through to the normal sign-in redirect.
    }
  }

  const url = new URL("/auth", request.url);
  url.searchParams.set("mode", "signin");
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/api", "/api/:path*", "/welcome/:path*", "/dashboard/:path*", "/agent/:path*", "/integrations/:path*", "/settings/:path*", "/profile/:path*"],
};
