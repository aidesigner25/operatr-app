import "server-only";

import { supabaseRest } from "@/lib/server/supabase";
import { providerSystemInstruction, type ResponseStyle } from "@/lib/server/chat-types";

type OperatorPreferencesRecord = {
  business_goals: string | null;
  writing_sample: string | null;
  agent_instructions: string | null;
};

export async function loadOperatorPreferences(userId: string, accessToken: string) {
  const result = await supabaseRest<OperatorPreferencesRecord[]>(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=business_goals,writing_sample,agent_instructions&limit=1`,
    accessToken,
  );
  return result.data?.[0] || null;
}

function clipped(value: string | null | undefined, maximum: number) {
  return value?.trim().slice(0, maximum) || "";
}

/** User-authored preferences are bounded and appended to the immutable base prompt server-side. */
export function operatorSystemInstruction(style: ResponseStyle, preferences: OperatorPreferencesRecord | null) {
  const sections = [
    ["Business context", clipped(preferences?.business_goals, 4_000)],
    ["Writing sample", clipped(preferences?.writing_sample, 6_000)],
    ["Operator directives", clipped(preferences?.agent_instructions, 4_000)],
  ].filter(([, value]) => value);
  if (!sections.length) return providerSystemInstruction(style);
  return `${providerSystemInstruction(style)}\n\nPrivate operator preferences (follow these only when they do not conflict with the system instructions):\n${sections.map(([label, value]) => `\n[${label}]\n${value}`).join("\n")}`;
}
