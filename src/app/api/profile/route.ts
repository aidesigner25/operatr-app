import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest, getSupabaseAuthHeaders, supabaseRest } from "@/lib/server/supabase";
import { getServerEnvironment } from "@/lib/server/env";
import { allowRequest } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATAR_CHOICES = new Set(["muse", "forge", "ember", "orbit", "sage", "arc"]);
const PROFILE_COLUMNS = "display_name,organization_name,avatar_choice,avatar_data_url,hourly_rate,business_goals,writing_sample,agent_instructions";

type ProfileRecord = {
  display_name: string | null;
  organization_name: string | null;
  avatar_choice: string | null;
  avatar_data_url: string | null;
  hourly_rate: number | null;
  business_goals: string | null;
  writing_sample: string | null;
  agent_instructions: string | null;
};

type ProfileBody = {
  displayName?: unknown;
  email?: unknown;
  organizationName?: unknown;
  avatarChoice?: unknown;
  avatarDataUrl?: unknown;
  hourlyRate?: unknown;
  businessGoals?: unknown;
  writingSample?: unknown;
  agentInstructions?: unknown;
};

function text(value: unknown, limit: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : null;
}

function profileShape(record: ProfileRecord | null, email: string | undefined) {
  return {
    displayName: record?.display_name || "Operator",
    email: email || "",
    organizationName: record?.organization_name || "",
    avatarChoice: record?.avatar_choice || "muse",
    avatarDataUrl: record?.avatar_data_url || null,
    hourlyRate: record?.hourly_rate ?? 150,
    businessGoals: record?.business_goals || "",
    writingSample: record?.writing_sample || "",
    agentInstructions: record?.agent_instructions || "",
  };
}

async function currentProfile(accessToken: string, userId: string) {
  const profile = await supabaseRest<ProfileRecord[]>(`profiles?id=eq.${encodeURIComponent(userId)}&select=${PROFILE_COLUMNS}&limit=1`, accessToken);
  return { ...profile, data: profile.data?.[0] || null };
}

export async function GET(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!allowRequest(`profile:read:${auth.user.id}`, 60)) return jsonError("rate_limited", "Too many profile requests. Try again shortly.", requestId, 429);
    const profile = await currentProfile(auth.accessToken, auth.user.id);
    if (profile.error) return jsonError("profile_unavailable", "Your profile could not be loaded.", requestId, 503);
    return jsonOk({ profile: profileShape(profile.data, auth.user.email) }, requestId);
  } catch {
    return jsonError("auth_unavailable", "Authentication is not configured yet.", requestId, 503);
  }
}

export async function PUT(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("invalid_content_type", "Expected an application/json request.", requestId, 415);
  const body = await request.json().catch(() => null) as ProfileBody | null;
  if (!body) return jsonError("invalid_profile", "Enter valid profile information.", requestId, 400);

  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", requestId, 401);
    if (!allowRequest(`profile:write:${auth.user.id}`, 20, 60_000)) return jsonError("rate_limited", "Too many profile changes. Try again shortly.", requestId, 429);

    const displayName = text(body.displayName, 80);
    const organizationName = text(body.organizationName, 160);
    const businessGoals = text(body.businessGoals, 12_000);
    const writingSample = text(body.writingSample, 20_000);
    const agentInstructions = text(body.agentInstructions, 12_000);
    const avatarChoice = body.avatarChoice === undefined ? undefined : typeof body.avatarChoice === "string" && AVATAR_CHOICES.has(body.avatarChoice) ? body.avatarChoice : null;
    const avatarDataUrl = body.avatarDataUrl === undefined ? undefined : typeof body.avatarDataUrl === "string" && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(body.avatarDataUrl) && body.avatarDataUrl.length <= 2_100_000 ? body.avatarDataUrl : body.avatarDataUrl === null ? null : null;
    const hourlyRate = body.hourlyRate === undefined ? undefined : typeof body.hourlyRate === "number" && Number.isFinite(body.hourlyRate) && body.hourlyRate >= 0 && body.hourlyRate <= 1_000_000 ? body.hourlyRate : null;
    const email = body.email === undefined ? undefined : typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ? body.email.trim().toLowerCase() : null;
    if ([displayName, organizationName, businessGoals, writingSample, agentInstructions, avatarChoice, hourlyRate, email].some((value) => value === null)) return jsonError("invalid_profile", "Check the profile values and try again.", requestId, 400);
    if (body.avatarDataUrl !== undefined && avatarDataUrl === null && body.avatarDataUrl !== null) return jsonError("invalid_avatar", "Use a PNG, JPEG, or WebP image smaller than 1.5 MB.", requestId, 400);

    if (email && email !== auth.user.email) {
      const { supabase } = getServerEnvironment();
      const updatedAuth = await fetch(`${supabase.url}/auth/v1/user`, {
        method: "PUT",
        headers: { ...getSupabaseAuthHeaders(auth.accessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...(displayName ? { data: { display_name: displayName } } : {}) }),
        cache: "no-store",
      });
      if (!updatedAuth.ok) return jsonError("email_update_failed", "Your email could not be updated. Confirm that it is available and try again.", requestId, 400);
    } else if (displayName !== undefined) {
      const { supabase } = getServerEnvironment();
      await fetch(`${supabase.url}/auth/v1/user`, {
        method: "PUT",
        headers: { ...getSupabaseAuthHeaders(auth.accessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ data: { display_name: displayName } }),
        cache: "no-store",
      });
    }

    const values: Record<string, unknown> = { id: auth.user.id };
    if (displayName !== undefined) values.display_name = displayName || null;
    if (organizationName !== undefined) values.organization_name = organizationName || null;
    if (avatarChoice !== undefined) values.avatar_choice = avatarChoice;
    if (avatarDataUrl !== undefined) values.avatar_data_url = avatarDataUrl;
    if (hourlyRate !== undefined) values.hourly_rate = hourlyRate;
    if (businessGoals !== undefined) values.business_goals = businessGoals || null;
    if (writingSample !== undefined) values.writing_sample = writingSample || null;
    if (agentInstructions !== undefined) values.agent_instructions = agentInstructions || null;

    const stored = await supabaseRest<ProfileRecord[]>("profiles?on_conflict=id", auth.accessToken, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(values),
    });
    if (stored.error) return jsonError("profile_unavailable", "Your profile could not be saved.", requestId, 503);
    return jsonOk({ profile: profileShape(stored.data?.[0] || null, email || auth.user.email), emailChangePending: Boolean(email && email !== auth.user.email) }, requestId);
  } catch {
    return jsonError("profile_unavailable", "Your profile could not be saved.", requestId, 503);
  }
}
