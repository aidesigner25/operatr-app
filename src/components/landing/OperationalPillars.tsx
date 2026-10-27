"use client";

import React from "react";
import {
  Radar,
  Search,
  Users,
  FileCheck2,
  ShieldCheck,
  Gauge,
  ArrowUpRight,
} from "lucide-react";

interface Pillar {
  number: string;
  title: string;
  hook: string;
  description: string;
  icon: React.ReactNode;
  tools: string[];
  metric: string;
}

const PILLARS: Pillar[] = [
  {
    number: "01",
    title: "Social Signal Intelligence",
    hook: "Spot buyer intent before competitors notice.",
    description:
      "Surfaces recurring customer complaints, tool dissatisfaction, and emerging market demands across social channels. Delivers targeted leads, not generic sentiment graphs.",
    icon: <Radar className="w-5 h-5" />,
    tools: ["X / Twitter", "Apify", "Tavily"],
    metric: "Lead Detection",
  },
  {
    number: "02",
    title: "Competitor Change Radar",
    hook: "Continuous surveillance of pricing and product moves.",
    description:
      "Crawls competitor landing pages, fee structures, and career roadmaps automatically. Pinpoints exactly what changed, why it matters, and recommended counter-actions.",
    icon: <Search className="w-5 h-5" />,
    tools: ["Apify Web Crawler", "Core LLM"],
    metric: "Diff Detection",
  },
  {
    number: "03",
    title: "Partnership Opportunity Finder",
    hook: "Source high-affinity creators and co-marketing allies.",
    description:
      "Discovers complementary software brands and creators already discussing your target problem. Ranks alignment using empirical evidence and prepares personalized outreach.",
    icon: <Users className="w-5 h-5" />,
    tools: ["Tavily Search", "G-Suite"],
    metric: "Evidence Scoring",
  },
  {
    number: "04",
    title: "Automated Deliverable Creation",
    hook: "Instant Google Docs and pipeline tracking Sheets.",
    description:
      "Converts raw web intelligence into structured Google Docs briefing memos and populated Google Sheets pipelines with zero manual copy-pasting.",
    icon: <FileCheck2 className="w-5 h-5" />,
    tools: ["Google Docs", "Google Sheets"],
    metric: "Direct Export",
  },
  {
    number: "05",
    title: "Zero-Margin BYOK Vault",
    hook: "Your credentials, direct billing, complete privacy.",
    description:
      "Connect OpenAI, Anthropic, Gemini, or xAI with zero platform markups. Requests run directly on provider infrastructure with AES-256 client encryption.",
    icon: <ShieldCheck className="w-5 h-5" />,
    tools: ["OpenAI", "Claude", "xAI", "Gemini"],
    metric: "AES-256 Vault",
  },
  {
    number: "06",
    title: "Live Value Telemetry",
    hook: "Quantifies saved hours and capital return per task.",
    description:
      "Every run calculates manual human hours saved, multiplied by your personal hourly rate. Watch your reclaimed time and financial return compound live.",
    icon: <Gauge className="w-5 h-5" />,
    tools: ["Live Engine", "Supabase DB"],
    metric: "Auditable ROI",
  },
];

export function OperationalPillars() {
  return (
    <div className="w-full max-w-7xl mx-auto px-5 sm:px-6 py-20">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--paper)] border border-[var(--line)] shadow-sm mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--tan)]" />
          <span className="text-[10px] font-mono tracking-[0.12em] text-[var(--muted-ink)] font-semibold uppercase">
            Operational Architecture
          </span>
        </div>
        <h2 className="font-display text-4xl sm:text-5xl tracking-[-0.045em] text-[var(--ink)]">
          Structured Intelligence. Zero Friction.
        </h2>
        <p className="text-sm text-[var(--muted-ink)] mt-2.5 max-w-lg mx-auto">
          Six native capabilities designed to turn hours of fragmented manual research into automated, decision-ready assets.
        </p>
      </div>

      <div className="operatr-card-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {PILLARS.map((pillar, index) => (
          <div
            key={pillar.title}
            className={`operatr-capability-card group relative min-h-[330px] overflow-hidden rounded-[1.65rem] border border-[var(--line)] bg-[var(--paper)] p-6 sm:p-7 transition-all duration-500 ease-out hover:-translate-y-1.5 hover:border-[var(--tan)] hover:shadow-[0_24px_60px_-28px_rgba(61,55,45,0.38)] flex flex-col justify-between ${index === 0 ? "md:col-span-2 lg:col-span-1" : ""}`}
          >
            <div className="capability-grid absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="capability-sheen absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[var(--tan)]/10 blur-2xl transition-transform duration-700 group-hover:-translate-x-10 group-hover:translate-y-10" />
            <div>
              <div className="relative flex items-center justify-between mb-9">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--sand)] border border-[var(--line)] flex items-center justify-center text-[var(--ink)] group-hover:bg-[var(--ink)] group-hover:border-[var(--ink)] group-hover:text-[var(--paper)] transition-colors duration-300">
                  {pillar.icon}
                  </div>
                  <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--tan)]">
                    // {pillar.number}
                  </span>
                </div>
                <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--muted-ink)] bg-[var(--tan-wash)] px-2.5 py-1 rounded-md border border-[var(--line)]">
                  {pillar.metric}
                </span>
              </div>

              <h3 className="relative font-display text-2xl tracking-[-0.035em] text-[var(--ink)] mb-2">
                {pillar.title}
              </h3>
              <p className="relative text-xs font-semibold text-[var(--ink)] leading-snug mb-3">
                {pillar.hook}
              </p>

              <p className="relative max-w-[32ch] text-xs text-[var(--muted-ink)] leading-relaxed">
                {pillar.description}
              </p>
            </div>

            <div className="relative pt-5 mt-6 border-t border-[var(--line)] flex items-end justify-between gap-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                {pillar.tools.map((t) => (
                  <span
                    key={t}
                    className="text-[9px] font-mono text-[var(--muted-ink)] bg-[var(--canvas)] px-2 py-1 rounded-md border border-[var(--line)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="w-8 h-8 shrink-0 rounded-xl bg-[var(--canvas)] border border-[var(--line)] flex items-center justify-center text-[var(--tan)] group-hover:bg-[var(--ink)] group-hover:border-[var(--ink)] group-hover:text-[var(--paper)] transition-all duration-300">
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
