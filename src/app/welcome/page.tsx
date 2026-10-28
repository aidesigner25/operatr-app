"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LayoutDashboard } from "lucide-react";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { writeOperatorConfig } from "@/lib/browser/operator-config";
import { useState } from "react";

export default function WelcomePage() {
  const router = useRouter();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const explore = () => {
    writeOperatorConfig({ skipped: true, hasActiveKeys: false, hourlyRate: 150, businessGoal: "General business research and competitor surveillance." });
    router.push("/dashboard");
  };

  return <main className="min-h-screen bg-[var(--canvas)] p-5 sm:p-10 flex items-center justify-center"><div className="w-full max-w-4xl rounded-[2rem] border border-[var(--line)] bg-[var(--paper)] p-7 sm:p-12 shadow-soft-lg"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tan)]">Account ready</p><h1 className="font-display text-5xl sm:text-6xl tracking-[-0.05em] mt-2">Choose your starting point.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted-ink)]">Configure your preferences now, or explore the workspace before secure connections are available.</p><div className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-4"><button onClick={() => setOnboardingOpen(true)} className="group text-left rounded-[1.5rem] border border-[var(--ink)] bg-[var(--ink)] p-6 text-[var(--paper)] transition-transform hover:-translate-y-1"><KeyRound className="w-5 h-5 text-[var(--tan-light)]" /><h2 className="font-display text-3xl tracking-[-0.035em] mt-6">Set up Operatr</h2><p className="mt-2 text-xs leading-relaxed text-[var(--tan-light)]">Choose model and tool preferences; secure connections arrive next.</p><span className="mt-6 inline-flex items-center gap-1 text-xs font-semibold">Start setup <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></span></button><button onClick={explore} className="group text-left rounded-[1.5rem] border border-[var(--line)] bg-[var(--canvas)] p-6 transition-transform hover:-translate-y-1 hover:border-[var(--tan)]"><LayoutDashboard className="w-5 h-5 text-[var(--tan)]" /><h2 className="font-display text-3xl tracking-[-0.035em] mt-6">Explore workspace</h2><p className="mt-2 text-xs leading-relaxed text-[var(--muted-ink)]">See the dashboard and its UI first. Live execution stays off until secure connections are added.</p><span className="mt-6 inline-flex items-center gap-1 text-xs font-semibold">Enter dashboard <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></span></button></div></div><OnboardingModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} onComplete={writeOperatorConfig} /></main>;
}
