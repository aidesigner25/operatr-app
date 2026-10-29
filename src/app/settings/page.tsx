"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  DollarSign,
  User,
  Sparkles,
  BookOpen,
  Check,
  Save,
  Shield,
  HelpCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function SettingsPage() {
  const [hourlyRate, setHourlyRate] = useState("150");
  const [businessGoals, setBusinessGoals] = useState(
    "Monitoring competitor pricing updates and tracking buyer dissatisfaction with legacy analytics tools on X/Twitter."
  );
  const [writingSample, setWritingSample] = useState(
    "We prioritize clarity over complexity. Keep memos under 400 words. Lead with empirical evidence, follow with a recommended action, and skip conversational throat-clearing."
  );
  const [behavioralRules, setBehavioralRules] = useState(
    "- Always cross-reference scraped social signals with live web search.\n- Highlight any pricing shifts exceeding 5% immediately.\n- Refuse to draft speculative summaries when primary evidence is absent."
  );

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { data?: { profile?: { hourlyRate?: number; businessGoals?: string; writingSample?: string; agentInstructions?: string } }; error?: { message?: string } };
      const profile = payload.data?.profile;
      if (!response.ok || !profile) { setError(payload.error?.message || "Settings could not be loaded."); return; }
      setHourlyRate(String(profile.hourlyRate ?? 150));
      setBusinessGoals(profile.businessGoals || "");
      setWritingSample(profile.writingSample || "");
      setBehavioralRules(profile.agentInstructions || "");
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    setError("");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourlyRate: Number(hourlyRate), businessGoals, writingSample, agentInstructions: behavioralRules }),
    });
    const payload = await response.json().catch(() => ({})) as { data?: { profile?: unknown }; error?: { message?: string } };
    if (!response.ok || !payload.data?.profile) setError(payload.error?.message || "Settings could not be saved.");
    else {
      setSavedSuccess(true);
      window.dispatchEvent(new CustomEvent("operatr:profile-updated", { detail: payload.data.profile }));
      window.setTimeout(() => setSavedSuccess(false), 2500);
    }
    setSaving(false);
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Agent Persona & Behavior Settings
            </h1>
            <p className="text-xs text-zinc-500">
              Calibrate how Operatr thinks, formats output, and calculates economic value.
            </p>
          </div>

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 shadow-sm transition-all disabled:opacity-60"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Configuration Saved</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? "Saving…" : "Save Changes"}</span>
              </>
            )}
          </button>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{error}</div>}

        {/* Section 1: Financial Telemetry */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <DollarSign className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Economic Telemetry Multiplier
            </h2>
          </div>

          <div className="max-w-md space-y-2">
            <label className="text-xs font-semibold text-zinc-800 block">
              Personal Hourly Rate ($ USD)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 font-mono">
                $
              </div>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-mono font-bold text-zinc-900 bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Every completed task computes estimated manual hours saved and multiplies it by this rate to record live dollar gains on your dashboard.
            </p>
          </div>
        </div>

        {/* Section 2: Business Goals & Identity */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <User className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Business Context & Strategic Focus
            </h2>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-800">
                Operational Goals (Injected into Agent Context)
              </label>
              <span className="text-[10px] font-mono text-zinc-400">
                Populated from Onboarding
              </span>
            </div>
            <textarea
              rows={3}
              value={businessGoals}
              onChange={(e) => setBusinessGoals(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-zinc-200 text-xs text-zinc-900 bg-white focus:outline-none focus:border-zinc-900 leading-relaxed font-sans"
            />
          </div>
        </div>

        {/* Section 3: Voice Sample Training */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <BookOpen className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Voice & Style Training Sample
            </h2>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-800 block">
              Writing Sample (How you write and communicate)
            </label>
            <textarea
              rows={4}
              value={writingSample}
              onChange={(e) => setWritingSample(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-zinc-200 text-xs text-zinc-900 bg-white focus:outline-none focus:border-zinc-900 leading-relaxed font-sans"
            />
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Operatr analyzes cadence, vocabulary, and sentence structure from this sample so generated memos, briefs, and social posts match your voice.
            </p>
          </div>
        </div>

        {/* Section 4: Behavioral Directives */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <Sparkles className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Behavioral Rules & Operational Directives
            </h2>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-800 block">
              Directives & Tone Guardrails
            </label>
            <textarea
              rows={4}
              value={behavioralRules}
              onChange={(e) => setBehavioralRules(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-zinc-200 text-xs font-mono text-zinc-900 bg-white focus:outline-none focus:border-zinc-900 leading-relaxed"
            />
            <p className="text-[10px] text-zinc-400">
              Core system safety parameters remain immutable. Custom directives steer task prioritization and synthesis framing.
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
