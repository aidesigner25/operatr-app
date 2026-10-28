import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/welcome", "/dashboard", "/agent", "/integrations", "/settings", "/profile", "/api/vault", "/api/chat"];
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

/** Verifies Supabase sessions before a request reaches any protected page or vault API route. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/api", "/welcome/:path*", "/dashboard/:path*", "/agent/:path*", "/integrations/:path*", "/settings/:path*", "/profile/:path*", "/api/vault/:path*", "/api/chat/:path*"],
};
