"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clock3, DollarSign, FileText, MoreHorizontal, Sparkles, TrendingUp } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardChat } from "@/components/dashboard/DashboardChat";

const telemetry = [
  { month: "May", value: 540, hours: 3.6 }, { month: "Jun", value: 780, hours: 5.2 }, { month: "Jul", value: 1035, hours: 6.9 },
  { month: "Aug", value: 1420, hours: 9.5 }, { month: "Sep", value: 1095, hours: 7.3 }, { month: "Oct", value: 1520, hours: 10.1 }, { month: "Nov", value: 885, hours: 5.9 },
];

const recentRuns = [
  { title: "Fintech pricing surveillance", kind: "Research brief", hours: "2.8h", value: "$420", state: "Complete" },
  { title: "Buyer-signal qualification", kind: "Signal analysis", hours: "3.4h", value: "$510", state: "Ready" },
  { title: "Creator affinity scan", kind: "Strategy memo", hours: "1.9h", value: "$285", state: "Complete" },
];

export default function DashboardPage() {
  const [hourlyRate, setHourlyRate] = useState(150);
  const [activeTab, setActiveTab] = useState<"chat" | "runs">("chat");
  const hours = 48.5;
  const totalValue = Math.round(hours * hourlyRate);
  const maxValue = 1600;

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { data?: { profile?: { hourlyRate?: number } } };
      if (response.ok && payload.data?.profile?.hourlyRate !== undefined) setHourlyRate(payload.data.profile.hourlyRate);
    })();
  }, []);

  return <DashboardShell>
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.85rem] bg-[var(--ink)] px-6 py-7 text-[var(--paper)] shadow-soft-lg sm:px-8 sm:py-9">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,253,247,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,253,247,0.12)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.35fr_0.85fr] lg:items-end">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--tan-light)]">Operating intelligence</p><h1 className="mt-3 max-w-2xl font-display text-4xl leading-[0.95] tracking-[-0.055em] sm:text-5xl">Turn reclaimed time into measurable leverage.</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-[rgba(255,253,247,0.7)]">Your dashboard converts completed operating work into a transparent capital-equivalent estimate—not a vague activity score.</p></div>
          <div className="rounded-2xl border border-[rgba(255,253,247,0.18)] bg-[rgba(255,253,247,0.08)] p-5 backdrop-blur-sm"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tan-light)]">Capital reclaimed</span><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--tan-wash)] text-[var(--ink)]"><ArrowUpRight className="h-4 w-4" /></span></div><p className="mt-5 font-mono text-4xl font-bold tracking-[-0.06em]">${totalValue.toLocaleString()}</p><p className="mt-2 text-xs text-[rgba(255,253,247,0.7)]">{hours} verified hours × ${hourlyRate}/hour</p></div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Hours reclaimed", value: `${hours}h`, note: "Across completed work", icon: Clock3, tone: "bg-[var(--sand)]" }, { label: "Capital equivalent", value: `$${totalValue.toLocaleString()}`, note: "At your operating rate", icon: DollarSign, tone: "bg-[#edf3e8]" }, { label: "Signals filtered", value: "1,426", note: "Qualified this period", icon: Sparkles, tone: "bg-[#f1ece6]" }, { label: "Delivery confidence", value: "98.4%", note: "Completed without rework", icon: CheckCircle2, tone: "bg-[var(--tan-wash)]" }].map((stat) => { const Icon = stat.icon; return <article key={stat.label} className="group rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-soft transition-transform hover:-translate-y-0.5"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.tone} text-[var(--ink)]`}><Icon className="h-4 w-4" /></div><p className="mt-6 font-mono text-2xl font-bold tracking-[-0.06em]">{stat.value}</p><p className="mt-1 text-xs font-semibold">{stat.label}</p><p className="mt-1 text-[11px] text-[var(--muted-ink)]">{stat.note}</p></article>; })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.55fr_0.75fr]">
        <article className="overflow-hidden rounded-[1.6rem] border border-[var(--line)] bg-[var(--paper)] shadow-soft">
          <div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tan)]">Value trajectory</p><h2 className="mt-1 text-base font-bold tracking-tight">Capital equivalent by month</h2></div><div className="flex items-center gap-3 text-[10px] font-mono text-[var(--muted-ink)]"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--ink)]" />Value ($)</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#9aaa83]" />Hours</span></div></div>
          <div className="grid grid-cols-[2.5rem_1fr] gap-3 px-4 pb-5 pt-6 sm:px-6"><div className="flex h-56 flex-col justify-between pb-6 text-right font-mono text-[9px] text-[var(--muted-ink)]"><span>$1.6k</span><span>$1.2k</span><span>$800</span><span>$400</span><span>$0</span></div><div className="relative h-56 border-b border-[var(--line)] [background-image:linear-gradient(to_bottom,transparent_24%,rgba(87,80,69,0.12)_25%,transparent_26%,transparent_49%,rgba(87,80,69,0.12)_50%,transparent_51%,transparent_74%,rgba(87,80,69,0.12)_75%,transparent_76%)]"><div className="absolute inset-x-0 top-0 flex h-[calc(100%-1.35rem)] items-end justify-between gap-2">{telemetry.map((point) => <div key={point.month} className="group relative flex h-full flex-1 cursor-default items-end justify-center"><div className="absolute bottom-0 flex items-end gap-1"><span style={{ height: `${(point.value / maxValue) * 100}%` }} className="w-3 rounded-t-md bg-[var(--ink)] transition-all duration-300 group-hover:bg-[#526448] sm:w-5" /><span style={{ height: `${(point.hours / 12) * 100}%` }} className="w-1.5 rounded-t-md bg-[#a7b796] sm:w-2.5" /></div><div className="pointer-events-none absolute -top-1 z-10 hidden min-w-max rounded-lg bg-[var(--ink)] px-2 py-1.5 text-center font-mono text-[9px] text-[var(--paper)] shadow-lg group-hover:block"><b>${point.value.toLocaleString()}</b><br />{point.hours}h reclaimed</div><span className="absolute -bottom-6 font-mono text-[9px] text-[var(--muted-ink)]">{point.month}</span></div>)}</div></div></div>
          <div className="mx-5 mb-5 rounded-2xl bg-[var(--canvas)] px-4 py-3 sm:mx-6"><p className="text-xs font-semibold">How ROI is calculated</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-ink)]"><b className="text-[var(--ink)]">Completed run time saved</b> × your <b className="text-[var(--ink)]">${hourlyRate}/hour operating rate</b> = capital-equivalent value. Change the rate in Settings at any time.</p></div>
        </article>

        <aside className="rounded-[1.6rem] border border-[var(--line)] bg-[#eef0e8] p-5 shadow-soft sm:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#607050]">This period</p><h2 className="mt-1 text-base font-bold">Operating return</h2></div><TrendingUp className="h-5 w-5 text-[#607050]" /></div><div className="mt-8 border-y border-[#d4dbc9] py-5"><p className="font-mono text-4xl font-bold tracking-[-0.07em]">6.8×</p><p className="mt-1 text-xs text-[#526448]">Estimated return on the time you delegated to Operatr.</p></div><dl className="mt-5 space-y-3 text-xs"><div className="flex justify-between"><dt className="text-[var(--muted-ink)]">Work completed</dt><dd className="font-mono font-bold">42 runs</dd></div><div className="flex justify-between"><dt className="text-[var(--muted-ink)]">Average time saved</dt><dd className="font-mono font-bold">1.15h / run</dd></div><div className="flex justify-between"><dt className="text-[var(--muted-ink)]">Highest-value month</dt><dd className="font-mono font-bold">Oct · $1,520</dd></div></dl><Link href="/settings" className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#526448] hover:text-[var(--ink)]">Adjust operating rate <ArrowUpRight className="h-3.5 w-3.5" /></Link></aside>
      </section>

      <section className="overflow-hidden rounded-[1.6rem] border border-[var(--line)] bg-[var(--paper)] shadow-soft"><div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex gap-1 rounded-xl bg-[var(--canvas)] p-1"><button onClick={() => setActiveTab("chat")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activeTab === "chat" ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Ask Operatr</button><button onClick={() => setActiveTab("runs")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activeTab === "runs" ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Recent work</button></div><Link href="/agent" className="text-xs font-semibold text-[var(--muted-ink)] hover:text-[var(--ink)]">Open full workspace <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>{activeTab === "chat" ? <div className="p-5 sm:p-6"><DashboardChat /></div> : <div className="divide-y divide-[var(--line)]">{recentRuns.map((run) => <div key={run.title} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.6fr_0.8fr_0.5fr_0.5fr_auto] sm:items-center sm:px-6"><div><p className="text-xs font-semibold">{run.title}</p><p className="mt-1 text-[11px] text-[var(--muted-ink)]">{run.kind}</p></div><span className="w-fit rounded-full bg-[var(--sand)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{run.state}</span><span className="font-mono text-xs font-bold">{run.hours}</span><span className="font-mono text-xs font-bold text-[#526448]">{run.value}</span><button className="justify-self-start rounded-lg p-1 text-[var(--muted-ink)] hover:bg-[var(--sand)]"><MoreHorizontal className="h-4 w-4" /></button></div>)}</div>}</section>
    </div>
  </DashboardShell>;
}
