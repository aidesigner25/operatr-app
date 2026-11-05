import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptCredential } from "@/lib/server/vault";
import { supabaseRest } from "@/lib/server/supabase";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_STATE_COOKIE = "operatr-google-oauth";
export const OAUTH_LIFETIME_SECONDS = 600;

type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string; origin: string };
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!clientId || !clientSecret || !redirectUri || !appUrl) return null;
  try {
    const app = new URL(appUrl);
    const redirect = new URL(redirectUri);
    if (app.username || app.password || app.pathname !== "/" || app.search || app.hash || redirect.origin !== app.origin || redirect.pathname !== "/api/google-workspace/callback" || redirect.search || redirect.hash) return null;
    if (app.protocol !== "https:" && !(app.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname))) return null;
    return { clientId, clientSecret, redirectUri, origin: app.origin };
  } catch { return null; }
}

export function sameOrigin(request: Request, config: GoogleConfig) {
  return request.headers.get("origin") === config.origin;
}

export function createGoogleAuthorization(userId: string, config: GoogleConfig) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: GOOGLE_SCOPE, access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  const payload = Buffer.from(JSON.stringify({ state, verifier, userId, expires: Date.now() + OAUTH_LIFETIME_SECONDS * 1000 })).toString("base64url");
  const signature = createHmac("sha256", config.clientSecret).update(payload).digest("base64url");
  const cookie = `${payload}.${signature}`;
  return { url: url.toString(), cookie };
}

export function validateGoogleState(cookie: string | undefined, state: string | null, userId: string, config: GoogleConfig): string | null {
  if (!cookie || !state || cookie.length > 2048 || state.length > 128) return null;
  try {
    const [payload, signature, extra] = cookie.split(".");
    if (!payload || !signature || extra) return null;
    const expectedSignature = createHmac("sha256", config.clientSecret).update(payload).digest();
    const actualSignature = Buffer.from(signature, "base64url");
    if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { state?: unknown; verifier?: unknown; userId?: unknown; expires?: unknown };
    if (typeof data.state !== "string" || typeof data.verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.verifier) || data.userId !== userId || typeof data.expires !== "number" || !Number.isFinite(data.expires) || data.expires < Date.now() || data.expires > Date.now() + OAUTH_LIFETIME_SECONDS * 1000) return null;
    const expected = Buffer.from(data.state);
    const actual = Buffer.from(state);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return data.verifier;
  } catch { return null; }
}

export async function exchangeGoogleCode(code: string, verifier: string, config: GoogleConfig) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: verifier }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => null) as { refresh_token?: unknown; scope?: unknown } | null;
  if (!response.ok || typeof body?.refresh_token !== "string" || body.refresh_token.length < 8 || body.refresh_token.length > 4096 || typeof body.scope !== "string" || !body.scope.split(" ").includes(GOOGLE_SCOPE)) throw new Error("Google did not grant the required offline access.");
  return body.refresh_token;
}

export async function loadGoogleRefreshToken(userId: string, accessToken: string) {
  const result = await supabaseRest<{ encrypted_refresh_token: string }[]>(`google_workspace_connections?user_id=eq.${encodeURIComponent(userId)}&select=encrypted_refresh_token&limit=1`, accessToken);
  if (result.error) throw new Error("Workspace connection unavailable.");
  const ciphertext = result.data?.[0]?.encrypted_refresh_token;
  return ciphertext ? decryptCredential(ciphertext, userId, "google_workspace") : null;
}
