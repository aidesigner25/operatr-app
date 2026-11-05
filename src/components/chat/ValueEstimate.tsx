"use client";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import type { Estimate } from "@/components/chat/useValueEstimates";

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ");
}
export function ValueEstimate({ messageId, estimate, state, assessmentStatus }: { messageId: string; estimate?: Estimate; state: "loading" | "ready" | "error"; assessmentStatus?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState("");
  const [retryStatus, setRetryStatus] = useState("");
  useEffect(() => { setHours(estimate?.minutes_saved ? String(Math.floor(estimate.minutes_saved / 60)) : ""); setMinutes(estimate?.minutes_saved ? String(estimate.minutes_saved % 60) : ""); }, [estimate]);
  async function change(remove = false) {
    setError("");
    const h = hours === "" ? 0 : Number(hours), m = minutes === "" ? 0 : Number(minutes);
    const total = h * 60 + m;
    if (!remove && (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59 || total < 1 || total > 60000)) { setError("Enter up to 1,000 hours and 0–59 minutes (at least 1 minute total)."); return; }
    setBusy(true);
    try {
      const endpoint = `/api/value-estimates?messageId=${encodeURIComponent(messageId)}`;
      const response = await fetch(endpoint, remove ? { method: "DELETE" } : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes: total }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "The estimate could not be saved.");
      setOpen(false);
      window.dispatchEvent(new Event("operatr:value-updated"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The estimate could not be saved."); }
    finally { setBusy(false); }
  }
  async function retryAutomatic() {
    setError(""); setRetryStatus(""); setBusy(true);
    try {
      const response = await fetch("/api/value-estimates/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }) });
      const payload = await response.json() as { data?: { status?: string }; error?: { message?: string } };
      if (!response.ok || !payload.data?.status) throw new Error(payload.error?.message || "The estimate could not be retried.");
      setRetryStatus(payload.data.status);
      window.dispatchEvent(new Event("operatr:value-updated"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The estimate could not be retried."); }
    finally { setBusy(false); }
  }
  const rateCents = estimate ? Math.round(Number(estimate.hourly_rate) * 100) : 0;
  const value = estimate ? Math.round(estimate.minutes_saved * rateCents / 60) / 100 : 0;
  const failures: Record<string, string> = { storage_unavailable: "Value tracking storage unavailable · check database setup", storage_write_failed: "Automatic estimate could not be saved", model_unavailable: "Automatic estimate could not reach the model", model_timeout: "Automatic estimate timed out waiting for the model", model_busy: "The model provider is temporarily unavailable or rate-limited", model_connection: "Could not connect to the model provider", model_rejected: "The model provider rejected the estimate request", model_incomplete: "The model connection ended before the estimate was complete", model_output_limit: "The model reached its output limit before producing an estimate", model_invalid: "The model did not return a usable value estimate" };
  const label = state === "loading" ? "Loading value estimate…" : state === "error" ? "Value estimate unavailable · check database setup" : estimate?.source === "not_applicable" ? "No value estimate · task did not qualify as substantial work" : estimate ? `Estimated ${duration(estimate.minutes_saved)} saved · $${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} equivalent` : failures[retryStatus || assessmentStatus || ""] || "Value estimate unavailable or not assessed";
  return <div className="mt-3 border-t border-[var(--line)] pt-3 text-xs">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><Clock3 className="h-3.5 w-3.5 text-[var(--muted-ink)]" /><span className="text-[var(--muted-ink)]">{label}</span><button type="button" onClick={() => { setOpen(!open); setError(""); }} aria-expanded={open} className="font-semibold text-[var(--ink)] underline underline-offset-2">{estimate && estimate.minutes_saved > 0 ? "Edit" : "Add estimate"}</button>{(!estimate || estimate.source === "not_applicable") && state !== "loading" && <button type="button" disabled={busy} onClick={() => void retryAutomatic()} className="font-semibold text-[var(--ink)] underline underline-offset-2 disabled:opacity-50">{busy ? "Estimating…" : estimate ? "Reassess" : "Retry automatic"}</button>}</div>
    {(!estimate || estimate.source === "not_applicable") && state !== "loading" && <p className="mt-1 text-[10px] text-[var(--muted-ink)]">Retry uses the conversation’s current model and may incur model usage; it won’t rerun research.</p>}
    {estimate?.source === "not_applicable" && failures[retryStatus] && <p role="alert" className="mt-1 text-red-700">{failures[retryStatus]}</p>}
    {!open && error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {open && <div className="mt-3 space-y-2"><p className="leading-relaxed text-[var(--muted-ink)]">Adjust the estimated time saved. Saving uses your current operating rate; estimates are not verified hours or cash earned.</p><div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`hours-${messageId}`}>Hours saved</label><input id={`hours-${messageId}`} type="number" min="0" max="1000" step="1" value={hours} onChange={(event) => setHours(event.target.value)} disabled={busy} placeholder="Hours" className="w-20 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]" /><label className="sr-only" htmlFor={`minutes-${messageId}`}>Minutes saved</label><input id={`minutes-${messageId}`} type="number" min="0" max="59" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={busy} placeholder="Minutes" className="w-20 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]" /><button type="button" disabled={busy} onClick={() => void change()} className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-[var(--paper)] disabled:opacity-50">Save</button>{estimate && estimate.minutes_saved > 0 && <button type="button" disabled={busy} onClick={() => void change(true)} className="rounded-lg px-2 py-1.5 text-xs underline disabled:opacity-50">Remove</button>}</div>{estimate && estimate.minutes_saved > 0 && <p className="text-[var(--muted-ink)]">{estimate.source === "model" ? "Model estimate" : "Your estimate"} · ${Number(estimate.hourly_rate).toLocaleString()}/hour when saved.</p>}{error && <p role="alert" className="text-red-700">{error}</p>}</div>}
  </div>;
}
