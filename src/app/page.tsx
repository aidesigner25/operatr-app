"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Terminal,
  Clock,
  Cpu,
  ChevronDown,
} from "lucide-react";
import { LandingNav } from "@/components/landing/LandingNav";
import { ToolsMarquee } from "@/components/landing/ToolsMarquee";
import { OperationalPillars } from "@/components/landing/OperationalPillars";
import { InteractiveTerminalDemo } from "@/components/landing/InteractiveTerminalDemo";
import { RoiCalculator } from "@/components/landing/RoiCalculator";
import { AmbientSignalField } from "@/components/landing/AmbientSignalField";
import { HeroWorkspace } from "@/components/landing/HeroWorkspace";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex flex-col selection:bg-[var(--ink)] selection:text-[var(--paper)] relative overflow-x-hidden">
      {/* Fixed Pill Navigation */}
      <LandingNav onOpenAuth={() => { window.location.href = "/auth"; }} />

      {/* HERO SECTION */}
      <section id="vision" className="relative min-h-[92vh] flex flex-col justify-between items-center px-5 sm:px-6 pt-28 sm:pt-32 pb-10 overflow-hidden">
        <div className="hero-wash absolute inset-0 pointer-events-none" />
        <div className="hero-contrast-field absolute right-[-7rem] top-24 h-[31rem] w-[min(48rem,72vw)] rounded-[3rem] pointer-events-none" />
        <div className="absolute right-0 top-16 h-[36rem] w-[min(58rem,80vw)] opacity-80 pointer-events-none"><AmbientSignalField /></div>

        <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center my-auto">
          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[rgba(255,253,247,0.7)] px-3.5 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#748260] animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-[0.11em] text-[var(--muted-ink)] font-medium">
                Private Agentic OS • Runs on Your Terms
              </span>
            </div>

            <h1 className="font-display text-[2.8rem] sm:text-6xl lg:text-[4.45rem] tracking-[-0.055em] text-[var(--ink)] leading-[0.94]">
              <span className="text-[var(--tan)] block">
                Reclaim Your Hours.
              </span>
              Direct Your Private Intelligence.
            </h1>

            <p className="text-sm sm:text-[15px] text-[var(--muted-ink)] max-w-xl font-normal leading-relaxed">
              Operatr is your individualized AI operating system that runs research, competitor surveillance, and daily tasks to help you plan wiser move faster. Start now to regain $500+ in lost time every week.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => { window.location.href = "/auth"; }}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-semibold hover:-translate-y-0.5 hover:shadow-[0_12px_25px_-12px_rgba(61,55,45,0.55)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
              >
                <span>Start for free</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>

              <Link
                href="#simulation"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-[rgba(255,253,247,0.64)] border border-[var(--line)] text-[var(--ink)] text-xs font-semibold hover:bg-[var(--paper)] hover:border-[var(--tan)] transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Watch Live Workspace</span>
              </Link>
            </div>

            <div className="pt-4 flex items-center gap-x-5 gap-y-2 text-[10px] font-mono uppercase tracking-[0.04em] text-[var(--muted-ink)] flex-wrap">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--tan)]" />
                Direct API Keys (No Markups)
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--tan)]" />
                Live Reclaimed Hours Telemetry
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[var(--tan)]" />
                OpenAI, Claude, Gemini, xAI
              </span>
            </div>
          </div>

          <div className="relative flex items-center justify-center py-4 lg:py-0"><HeroWorkspace /></div>
        </div>

        {/* Hero Bottom Bar Accent */}
        <div className="relative z-10 w-full max-w-7xl mx-auto flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--muted-ink)] border-t border-[var(--line)] pt-4 mt-8 px-2">
          <span className="hidden sm:inline">The journey begins in silence.</span>
          <a
            href="#tools"
            className="flex items-center gap-1 text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors mx-auto sm:mx-0"
          >
            <span>scroll</span>
            <ChevronDown className="w-3 h-3 animate-bounce" />
          </a>
          <span className="hidden sm:inline">
            Direct intelligence for focused operators.
          </span>
        </div>
      </section>

      {/* INFINITE HORIZONTAL TOOL TICKER */}
      <section id="tools" className="relative z-20">
        <ToolsMarquee />
      </section>

      {/* CORE OPERATIONAL PILLARS */}
      <section id="engine" className="relative z-20 bg-[var(--canvas)]">
        <OperationalPillars />
      </section>

      {/* INTERACTIVE CHAT WORKSPACE SIMULATION */}
      <section id="simulation" className="relative z-20 py-20 px-5 sm:px-6 bg-[var(--sand)] border-y border-[var(--line)]">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--muted-ink)] font-medium">
            Autonomous Pipeline Preview
          </span>
          <h2 className="font-display text-4xl sm:text-5xl tracking-[-0.04em] text-[var(--ink)] mt-2">
            Watch Operatr In Action
          </h2>
          <p className="text-sm text-[var(--muted-ink)] mt-2">
            Click &ldquo;Run Pipeline Simulation&rdquo; to test real-time research synthesis, document creation, and ROI calculation.
          </p>
        </div>

        <InteractiveTerminalDemo />
      </section>

      {/* INTERACTIVE VALUE & ROI CALCULATOR */}
      <section id="calculator" className="relative z-20 py-20 px-5 sm:px-6 bg-[var(--canvas)]">
        <RoiCalculator />
      </section>

      {/* BYOK SECURITY ARCHITECTURE SECTION */}
      <section id="byok" className="relative z-20 py-20 px-5 sm:px-6 border-t border-[var(--line)] bg-[var(--paper)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(157,137,103,0.12),transparent_32rem)] pointer-events-none" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-14">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--muted-ink)] font-medium">
              Architecture & Trust
            </span>
            <h2 className="font-display text-4xl sm:text-5xl tracking-[-0.04em] text-[var(--ink)] mt-2">
              Private By Construction
            </h2>
            <p className="text-sm text-[var(--muted-ink)] mt-2">
              Traditional SaaS wraps AI models and charges 300% markups while storing your sensitive intelligence prompts. Operatr runs on your terms.
            </p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="group p-6 rounded-[1.6rem] bg-[var(--canvas)] border border-[var(--line)] space-y-4 transition-all duration-300 hover:-translate-y-1 hover:bg-[var(--paper)] hover:border-[var(--tan)] hover:shadow-soft-lg">
              <div className="w-10 h-10 rounded-2xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl tracking-[-0.03em] text-[var(--ink)]">
                Encrypted BYOK Vault
              </h3>
              <p className="text-xs text-[var(--muted-ink)] leading-relaxed">
                Credentials are encrypted with per-user AES-256 keys. Keys never appear in client bundles or public logs. One click purges all stored secrets.
              </p>
            </div>

            <div className="group p-6 rounded-[1.6rem] bg-[var(--canvas)] border border-[var(--line)] space-y-4 transition-all duration-300 hover:-translate-y-1 hover:bg-[var(--paper)] hover:border-[var(--tan)] hover:shadow-soft-lg">
              <div className="w-10 h-10 rounded-2xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl tracking-[-0.03em] text-[var(--ink)]">
                Prompt Injection Isolation
              </h3>
              <p className="text-xs text-[var(--muted-ink)] leading-relaxed">
                Scraped social feeds and competitor pages are encapsulated in strict XML data envelopes. External data cannot manipulate agent directives.
              </p>
            </div>

            <div className="group p-6 rounded-[1.6rem] bg-[var(--canvas)] border border-[var(--line)] space-y-4 transition-all duration-300 hover:-translate-y-1 hover:bg-[var(--paper)] hover:border-[var(--tan)] hover:shadow-soft-lg">
              <div className="w-10 h-10 rounded-2xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl tracking-[-0.03em] text-[var(--ink)]">
                Multi-Model Fault Tolerance
              </h3>
              <p className="text-xs text-[var(--muted-ink)] leading-relaxed">
                Configure primary and fallback models across OpenAI, Anthropic, Google, and xAI. When one provider hits downtime, Operatr reroutes automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL BOTTOM CALL TO ACTION */}
      <section className="relative z-20 py-24 px-5 sm:px-6 bg-[var(--ink)] text-[var(--paper)] overflow-hidden">
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(249,247,240,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(249,247,240,0.09)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[var(--tan)]/20 blur-3xl" />
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--tan-light)] font-semibold">
            Deploy Operatr Today
          </span>
          <h2 className="font-display text-5xl sm:text-6xl tracking-[-0.045em]">
            Stop Doing Repetitive Research By Hand.
          </h2>
          <p className="text-sm sm:text-base text-[var(--tan-light)] max-w-xl mx-auto">
            Take 2 minutes to connect your keys. Start delegating competitor tracking, social discovery, and executive deliverables immediately.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => { window.location.href = "/auth"; }}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[var(--paper)] text-[var(--ink)] text-xs font-bold hover:bg-white hover:shadow-soft active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span>Start for free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <Link
              href="#simulation"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl border border-[rgba(249,247,240,0.22)] text-[var(--paper)] text-xs font-semibold hover:bg-white/10 transition-all text-center"
            >
              Watch Live Demo
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-20 py-10 px-5 sm:px-6 border-t border-[var(--line)] bg-[var(--canvas)] text-[var(--muted-ink)] text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full overflow-hidden">
              <img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" />
            </div>
            <span className="font-semibold text-[var(--ink)]">Operatr OS</span>
            <span className="text-[var(--muted-ink)] text-[11px] font-mono">v1.0.0 MVP</span>
          </div>

          <div className="flex items-center gap-6 text-[11px] font-mono">
            <a href="#vision" className="hover:text-[var(--ink)]">Vision</a>
            <a href="#engine" className="hover:text-[var(--ink)]">Capabilities</a>
            <a href="#calculator" className="hover:text-[var(--ink)]">ROI Formula</a>
            <Link href="/dashboard" className="hover:text-[var(--ink)]">Dashboard</Link>
          </div>

          <div className="text-[11px] font-mono text-[var(--muted-ink)]">
            Private &bull; Adaptive &bull; Sovereign
          </div>
        </div>
      </footer>

    </div>
  );
}
