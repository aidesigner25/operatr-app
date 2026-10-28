type SupabaseAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  session?: { access_token?: string; refresh_token?: string } | null;
  user?: { id: string; email?: string } | null;
  error?: string;
  error_description?: string;
  msg?: string;
};

function confirmationRedirectUrl() {
  return `${window.location.origin}/auth?mode=signin&confirmed=1`;
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) throw new Error("Supabase is not configured for this environment.");
  return { url, publishableKey };
}

async function authRequest(path: string, init: RequestInit): Promise<SupabaseAuthPayload> {
  const { url, publishableKey } = config();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: publishableKey, "Content-Type": "application/json", ...init.headers },
  });
  const payload = await response.json().catch(() => ({})) as SupabaseAuthPayload;
  if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.error || "Authentication failed.");
  return payload;
}

async function persistSession(payload: SupabaseAuthPayload) {
  const accessToken = payload.access_token || payload.session?.access_token;
  const refreshToken = payload.refresh_token || payload.session?.refresh_token;
  if (!accessToken || !refreshToken) return false;

  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  });
  if (!response.ok) throw new Error("We could not start your secure session.");
  return true;
}

export async function signUp(email: string, password: string, displayName: string) {
  const redirectTo = encodeURIComponent(confirmationRedirectUrl());
  const payload = await authRequest(`signup?redirect_to=${redirectTo}`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      data: { display_name: displayName },
    }),
  });
  return { signedIn: await persistSession(payload), user: payload.user };
}

export async function resendSignupConfirmation(email: string) {
  const redirectTo = encodeURIComponent(confirmationRedirectUrl());
  await authRequest(`resend?redirect_to=${redirectTo}`, {
    method: "POST",
    body: JSON.stringify({ type: "signup", email }),
  });
}

export async function signIn(email: string, password: string) {
  const payload = await authRequest("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const signedIn = await persistSession(payload);
  if (!signedIn) throw new Error("The sign-in response did not include a session.");
  return payload.user;
}

export async function signOut() {
  await fetch("/api/auth/session", { method: "DELETE" });
}
