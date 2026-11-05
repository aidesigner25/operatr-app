import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthenticatedRequest, supabaseRest } from "@/lib/server/supabase";
import { getFeatureFlags } from "@/lib/server/feature-flags";
import { encryptCredential } from "@/lib/server/vault";
import { exchangeGoogleCode, googleConfig, GOOGLE_STATE_COOKIE, validateGoogleState } from "@/lib/server/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const config = googleConfig();
  if (!config) return new Response("Google Workspace is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
  const destination = new URL("/integrations", config.origin);
  let result = "error";
  try {
    const auth = await getAuthenticatedRequest();
    const params = new URL(request.url).searchParams;
    const cookie = (await cookies()).get(GOOGLE_STATE_COOKIE)?.value;
    const verifier = auth && validateGoogleState(cookie, params.get("state"), auth.user.id, config);
    if (getFeatureFlags().googleWorkspace && auth && verifier && params.get("error") === "access_denied") result = "cancelled";
    else if (getFeatureFlags().googleWorkspace && auth && verifier) {
      const code = params.get("code");
      if (!code || code.length > 4096) throw new Error("Invalid code.");
      const refreshToken = await exchangeGoogleCode(code, verifier, config);
      const encrypted = encryptCredential(refreshToken, auth.user.id, "google_workspace");
      const stored = await supabaseRest("google_workspace_connections?on_conflict=user_id", auth.accessToken, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: auth.user.id, encrypted_refresh_token: encrypted.ciphertext }) });
      if (stored.error) throw new Error("Unable to store connection.");
      result = "connected";
    }
  } catch { /* Do not expose provider responses or authorization codes. */ }
  destination.searchParams.set("google", result);
  const response = NextResponse.redirect(destination, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  response.cookies.set(GOOGLE_STATE_COOKIE, "", { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/google-workspace/callback", maxAge: 0 });
  return response;
}
