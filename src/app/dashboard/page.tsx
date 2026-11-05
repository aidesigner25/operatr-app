"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3, DollarSign, FileText, TrendingUp } from "lucide-react";
import { OperatorAvatar } from "@/components/profile/OperatorAvatar";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ValueTrajectory, type ValueSummary } from "@/components/dashboard/ValueTrajectory";
import { DashboardChat } from "@/components/dashboard/DashboardChat";


type Profile = { displayName: string; organizationName: string; avatarChoice: string; avatarDataUrl: string | null; hourlyRate: number };

type Run = { id: string; conversationId: string; title: string; completedAt: string | null };

export default function DashboardPage() {
  const [summary, setSummary] = useState<ValueSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"loading" | "ready" | "error">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "runs">("chat");
  const [runs, setRuns] = useState<Run[]>([]);
  const [runState, setRunState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const payload = await response.json() as { data?: { profile?: Profile } };
        if (mounted && response.ok && payload.data?.profile) setProfile(payload.data.profile);
      } catch { /* Keep the dashboard usable when profile data is unavailable. */ }
    };
    const refreshProfile = () => { void loadProfile(); };
    void loadProfile();
    window.addEventListener("operatr:profile-updated", refreshProfile);
    return () => { mounted = false; window.removeEventListener("operatr:profile-updated", refreshProfile); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/value-estimates/summary?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}`, { cache: "no-store" });
        const payload = await response.json() as { data?: { summary?: ValueSummary } };
        if (!response.ok || !payload.data?.summary) throw new Error("Unavailable");
        if (mounted) { setSummary(payload.data.summary); setSummaryState("ready"); }
      } catch { if (mounted) { setSummary(null); setSummaryState("error"); } }
    };
    void refresh();
    window.addEventListener("operatr:value-updated", refresh);
    return () => { mounted = false; window.removeEventListener("operatr:value-updated", refresh); };
  }, []);

  useEffect(() => {
    if (activeTab !== "runs") return;
    let mounted = true;
    setRunState("loading");
    void (async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const payload = await response.json() as { data?: { runs?: Run[] } };
        if (!response.ok || !Array.isArray(payload.data?.runs)) throw new Error("Unavailable");
        if (mounted) { setRuns(payload.data.runs); setRunState("ready"); }
      } catch { if (mounted) setRunState("error"); }
    })();
    return () => { mounted = false; };
  }, [activeTab]);

  const hasEstimates = Boolean(summary?.count);
  const hours = summary ? summary.minutes / 60 : 0;
  const money = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const decimal = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return <DashboardShell>
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.85rem] bg-[var(--ink)] px-6 py-7 text-[var(--paper)] shadow-soft-lg sm:px-8 sm:py-9">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,253,247,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,253,247,0.12)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.35fr_0.85fr] lg:items-end">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--tan-light)]">Operating intelligence</p><h1 className="mt-3 max-w-2xl font-display text-4xl leading-[0.95] tracking-[-0.055em] sm:text-5xl">Turn reclaimed time into measurable leverage.</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-[rgba(255,253,247,0.7)]">Your workspace for research, synthesis, and strategic work.</p></div>
          <div className="rounded-2xl border border-[rgba(255,253,247,0.18)] bg-[rgba(255,253,247,0.08)] p-5 backdrop-blur-sm"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tan-light)]">Capital equivalent</span><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--tan-wash)] text-[var(--ink)]"><ArrowUpRight className="h-4 w-4" /></span></div><p className="mt-5 font-mono text-4xl font-bold tracking-[-0.06em]">{hasEstimates && summary ? money(summary.value) : "—"}</p><p className="mt-2 text-xs text-[rgba(255,253,247,0.7)]">{summaryState === "error" ? "Estimates are unavailable; check setup." : hasEstimates ? "Based on model and user estimates." : "Qualifying completed work appears here automatically."}</p></div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Estimated hours saved", value: hasEstimates ? `${decimal(hours)}h` : "—", note: "Model and user estimates", icon: Clock3 }, { label: "Capital equivalent", value: hasEstimates && summary ? money(summary.value) : "—", note: "At the rate saved with each estimate", icon: DollarSign }, { label: "Responses estimated", value: summaryState === "ready" ? String(summary?.count ?? 0) : "—", note: "Responses with an estimate", icon: FileText }, { label: "Average time saved", value: hasEstimates && summary ? `${decimal(hours / summary.count)}h` : "—", note: "Per estimated response", icon: TrendingUp }].map((stat) => { const Icon = stat.icon; return <article key={stat.label} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-soft"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sand)] text-[var(--ink)]"><Icon className="h-4 w-4" /></div><p className="mt-6 font-mono text-2xl font-bold">{stat.value}</p><p className="mt-1 text-xs font-semibold">{stat.label}</p><p className="mt-1 text-[11px] text-[var(--muted-ink)]">{stat.note}</p></article>; })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.55fr_0.75fr]">
        <ValueTrajectory summary={summary} state={summaryState} />
        <aside className="rounded-[1.6rem] border border-[var(--line)] bg-[#eef0e8] p-5 shadow-soft sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#607050]">Your settings</p><div className="mt-5 flex min-w-0 items-center gap-3.5"><OperatorAvatar choice={profile?.avatarChoice} imageUrl={profile?.avatarDataUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl border border-[rgba(96,112,80,0.18)]" /><div className="min-w-0"><p className="break-words font-display text-xl leading-tight tracking-[-0.03em]">{profile?.displayName || "Your workspace"}</p><p className="mt-1 break-words text-xs text-[#607050]">{profile?.organizationName || "Your organization"}</p></div></div><div className="mt-6 border-t border-[rgba(96,112,80,0.18)] pt-5"><h2 className="text-xs font-semibold">Operating rate</h2><p className="mt-2 font-mono text-3xl font-bold tracking-[-0.06em]">{profile ? `$${profile.hourlyRate.toLocaleString()}` : "—"}<span className="ml-1 text-xs font-medium tracking-normal text-[#607050]">/ hour</span></p><p className="mt-2 text-xs leading-relaxed text-[#526448]">{profile ? "Used for future value estimates." : "Profile information is unavailable."}</p><Link href="/settings" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#526448] hover:text-[var(--ink)]">Adjust operating rate <ArrowUpRight className="h-3.5 w-3.5" /></Link></div></aside>
      </section>

      <section className="overflow-hidden rounded-[1.6rem] border border-[var(--line)] bg-[var(--paper)] shadow-soft"><div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex gap-1 rounded-xl bg-[var(--canvas)] p-1"><button onClick={() => setActiveTab("chat")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activeTab === "chat" ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Ask Operatr</button><button onClick={() => setActiveTab("runs")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activeTab === "runs" ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Recent work</button></div><Link href="/agent" className="text-xs font-semibold text-[var(--muted-ink)] hover:text-[var(--ink)]">Open full workspace <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>{activeTab === "chat" ? <div className="p-5 sm:p-6"><DashboardChat /></div> : <div className="divide-y divide-[var(--line)]">{runState === "loading" ? <p className="p-6 text-xs text-[var(--muted-ink)]">Loading recent work…</p> : runState === "error" ? <p className="p-6 text-xs text-red-700">Recent work could not be loaded. Switch tabs to try again.</p> : runs.length === 0 ? <p className="p-6 text-xs text-[var(--muted-ink)]">Your completed runs will appear here.</p> : runs.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><div><p className="text-xs font-semibold">{run.title}</p><p className="mt-1 text-[11px] text-[var(--muted-ink)]">{run.completedAt ? new Date(run.completedAt).toLocaleString() : "Completion time unavailable"}</p></div><span className="rounded-full bg-[var(--sand)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--muted-ink)]">Completed run</span></div>)}</div>}</section>
    </div>
  </DashboardShell>;
}
