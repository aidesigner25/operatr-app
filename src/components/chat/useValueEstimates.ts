"use client";
import { useCallback, useEffect, useState } from "react";

export type Estimate = { message_id: string; minutes_saved: number; hourly_rate: number; source: "model" | "user" | "not_applicable" };
export function useValueEstimates(conversationId: string | undefined, revision: string) {
  const [estimates, setEstimates] = useState<Record<string, Estimate>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!conversationId) { setEstimates({}); setState("ready"); return; }
    try {
      const response = await fetch(`/api/value-estimates/conversation?conversationId=${encodeURIComponent(conversationId)}`, { cache: "no-store", signal });
      const payload = await response.json() as { data?: { estimates?: Estimate[] } };
      if (!response.ok || !Array.isArray(payload.data?.estimates)) throw new Error("Unavailable");
      if (!signal?.aborted) { setEstimates(Object.fromEntries(payload.data.estimates.map((entry) => [entry.message_id, entry]))); setState("ready"); }
    } catch { if (!signal?.aborted) { setEstimates({}); setState("error"); } }
  }, [conversationId]);
  useEffect(() => {
    const controller = new AbortController();
    setEstimates({}); setState("loading");
    void load(controller.signal);
    return () => controller.abort();
  }, [load, revision]);
  useEffect(() => { const refresh = () => { void load(); }; window.addEventListener("operatr:value-updated", refresh); return () => window.removeEventListener("operatr:value-updated", refresh); }, [load]);
  return { estimates, state };
}
