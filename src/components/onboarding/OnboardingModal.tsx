"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Key,
  Shield,
  Sparkles,
  Bot,
  Zap,
  Globe,
  FileText,
  DollarSign,
  AlertCircle,
  X,
  CheckCircle2,
  Lock,
} from "lucide-react";

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: any) => void;
}

export function OnboardingModal({ isOpen, onClose, onComplete }: OnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState<"choice" | "llm" | "tools" | "goals" | "welcome">("choice");

  // Onboarding Form State
  const [primaryProvider, setPrimaryProvider] = useState<"openai" | "anthropic" | "google" | "xai">("openai");
  const [primaryModel, setPrimaryModel] = useState("gpt-4o");

  const [enableFallback, setEnableFallback] = useState(false);
  const [fallbackProvider, setFallbackProvider] = useState<"openai" | "anthropic" | "google" | "xai">("anthropic");
  const [fallbackModel, setFallbackModel] = useState("claude-3-5-sonnet-20241022");
  const [googleConnected, setGoogleConnected] = useState(false);

  const [businessGoal, setBusinessGoal] = useState("");
  const [hourlyRate, setHourlyRate] = useState("150");

  const [isInitializing, setIsInitializing] = useState(false);

  if (!isOpen) return null;

  const modelOptions = {
    openai: ["gpt-4o", "gpt-4o-mini", "o1-preview", "o1-mini"],
    anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    google: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"],
    xai: ["grok-2", "grok-2-mini", "grok-beta"],
  };

  const handleProviderChange = (provider: "openai" | "anthropic" | "google" | "xai") => {
    setPrimaryProvider(provider);
    setPrimaryModel(modelOptions[provider][0]);
    // ensure fallback is from a different provider
    if (fallbackProvider === provider) {
      const remaining = (["openai", "anthropic", "google", "xai"] as const).filter((p) => p !== provider);
      setFallbackProvider(remaining[0]);
      setFallbackModel(modelOptions[remaining[0]][0]);
    }
  };

  const handleSkip = () => {
    onComplete({
      skipped: true,
      hasActiveKeys: false,
      hourlyRate: 150,
      businessGoal: "General business research and competitor surveillance.",
    });
    onClose();
    router.push("/dashboard");
  };

  const handleFinishGuided = () => {
    setIsInitializing(true);
    setTimeout(() => {
      setIsInitializing(false);
      setStep("welcome");
    }, 1800);
  };

  const handleEnterDashboard = () => {
    onComplete({
      skipped: false,
      hasActiveKeys: false,
      needsSecureConnection: true,
      primaryProvider,
      primaryModel,
      fallbackProvider: enableFallback ? fallbackProvider : null,
      fallbackModel: enableFallback ? fallbackModel : null,
      googleConnected: false,
      businessGoal: businessGoal || "Building high-leverage business intelligence systems.",
      hourlyRate: Number(hourlyRate) || 150,
    });
    onClose();
    router.push("/dashboard");
  };

  return (
    <div className="operatr-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(55,52,46,0.64)] backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[var(--paper)] rounded-3xl border border-[var(--line)] shadow-2xl overflow-hidden relative">
        {/* Top Header */}
        <div className="px-8 py-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full overflow-hidden bg-[var(--ink)]"><img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" /></div>
            <span className="text-sm font-bold tracking-tight text-zinc-900">
              Operatr OS Provisioning
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP: CHOICE */}
        {step === "choice" && (
          <div className="p-8 sm:p-10 space-y-8">
            <div className="text-center max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-zinc-900" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
                Welcome to Operatr
              </h2>
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                Operatr is a private, zero-margin agentic operating system. All intelligence runs directly using your own API credentials with zero intermediate markup.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: Guided Setup */}
              <div
                onClick={() => setStep("llm")}
                className="p-6 rounded-2xl border-2 border-zinc-900 bg-zinc-50/50 hover:bg-zinc-50 cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center mb-3">
                    <Key className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Interactive Setup
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    Connect your core LLM (OpenAI, Anthropic, Gemini, or xAI) and research tools in under 2 minutes.
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                  <span>Start configuration</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Option 2: Skip to Explore */}
              <div
                onClick={handleSkip}
                className="p-6 rounded-2xl border border-zinc-200 hover:border-zinc-400 bg-white cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center mb-3">
                    <Lock className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Skip for Now
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    Explore the dashboard and UI layouts. Execution capabilities will remain disabled until keys are provided in Settings.
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-1.5 text-xs font-semibold text-zinc-500 group-hover:text-zinc-900">
                  <span>Explore dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 1: CORE LLM SELECTION */}
        {step === "llm" && (
          <div className="p-8 sm:p-10 space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">
                Step 1 of 3: Core LLM Engine
              </span>
              <h2 className="text-xl font-bold text-zinc-900 tracking-tight mt-1">
                Connect Primary Model Provider
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Select your preferred model intelligence. Only one key is required.
              </p>
            </div>

            {/* Provider Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: "openai", name: "OpenAI", sub: "GPT-4o / o1" },
                { id: "anthropic", name: "Anthropic", sub: "Claude 3.5" },
                { id: "google", name: "Google", sub: "Gemini 1.5/2.0" },
                { id: "xai", name: "xAI", sub: "Grok 2" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id as any)}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    primaryProvider === p.id
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  <div className="font-semibold text-xs">{p.name}</div>
                  <div
                    className={`text-[10px] font-mono mt-0.5 ${
                      primaryProvider === p.id ? "text-zinc-300" : "text-zinc-400"
                    }`}
                  >
                    {p.sub}
                  </div>
                </button>
              ))}
            </div>

            {/* Model Selector & Key Input */}
            <div className="space-y-3.5 pt-2">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Default Operational Model
                </label>
                <select
                  value={primaryModel}
                  onChange={(e) => setPrimaryModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs font-mono text-zinc-900 bg-zinc-50/50 focus:outline-none focus:border-zinc-900"
                >
                  {modelOptions[primaryProvider].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Secure connection
                </label>
                <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[10px] leading-relaxed text-zinc-500">Add the {primaryProvider.toUpperCase()} key from Integrations after onboarding. The encrypted vault never keeps a key in browser storage.</p>
              </div>
            </div>

            {/* Optional Fallback Toggle */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-zinc-800 block">
                    Automatic Secondary Fallback (Optional)
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Auto-reroutes tasks if primary provider suffers rate limits or downtime.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={enableFallback}
                  onChange={(e) => setEnableFallback(e.target.checked)}
                  className="w-4 h-4 accent-zinc-900 rounded cursor-pointer"
                />
              </div>

              {enableFallback && (
                <div className="pt-2 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                      Fallback Provider
                    </label>
                    <select
                      value={fallbackProvider}
                      onChange={(e) => {
                        const val = e.target.value as "openai" | "anthropic" | "google" | "xai";
                        setFallbackProvider(val);
                        setFallbackModel(modelOptions[val][0]);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
                    >
                      {(["openai", "anthropic", "google", "xai"] as const)
                        .filter((p) => p !== primaryProvider)
                        .map((p) => (
                          <option key={p} value={p}>
                            {p.toUpperCase()}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] leading-relaxed text-zinc-500">Connection is configured after onboarding in the secure vault. Cross-provider fallback stays off until you opt in during the runtime phase.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Step Controls */}
            <div className="pt-4 flex items-center justify-between border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setStep("choice")}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("tools")}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-all flex items-center gap-1.5"
              >
                <span>Continue to Tools</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: RESEARCH & TOOL CONNECTIONS */}
        {step === "tools" && (
          <div className="p-8 sm:p-10 space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">
                Step 2 of 3: Intelligence & Suite Access
              </span>
              <h2 className="text-xl font-bold text-zinc-900 tracking-tight mt-1">
                Connect External Data Tools
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Select the tools you may connect later. Live web, scraping, and document actions remain disabled in this phase.
              </p>
            </div>

            <div className="space-y-4">
              {/* Apify Input */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-zinc-900" />
                    <span className="text-xs font-bold text-zinc-900">
                      Apify API Token (Web Scrapers & Social Actors)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 bg-white px-2 py-0.5 rounded border border-zinc-200">
                    Free accounts supported
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400">Add this token later from Integrations. Operatr will not run an Apify actor in Phase 1.</p>
                <p className="text-[10px] text-zinc-400">
                  Note: Free Apify tier covers several initial crawls per month before rate limits apply.
                </p>
              </div>

              {/* Tavily Input */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-zinc-900" />
                    <span className="text-xs font-bold text-zinc-900">
                      Tavily Search API Key (Deep Web Intelligence)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 bg-white px-2 py-0.5 rounded border border-zinc-200">
                    Free accounts supported
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400">Add this key later from Integrations. Search requests stay disabled in Phase 1.</p>
              </div>

              {/* Google Suite Connection */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-900" />
                    <span className="text-xs font-bold text-zinc-900">
                      Google Suite (Docs & Sheets Creation)
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Grants restricted permissions to compile reports and write tracking rows.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGoogleConnected(!googleConnected)}
                  disabled
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    googleConnected
                      ? "bg-emerald-600 text-white flex items-center gap-1"
                      : "bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-900"
                  }`}
                >
                  {googleConnected ? (
                    <>
                      <Check className="w-3 h-3" /> Connected
                    </>
                  ) : (
                    "Authorize"
                  )}
                </button>
              </div>
            </div>

            {/* Step Controls */}
            <div className="pt-4 flex items-center justify-between border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setStep("llm")}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("goals")}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-all flex items-center gap-1.5"
              >
                <span>Continue to Goals</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: OPERATOR GOALS & HOURLY RATE */}
        {step === "goals" && (
          <div className="p-8 sm:p-10 space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">
                Step 3 of 3: Persona Calibration
              </span>
              <h2 className="text-xl font-bold text-zinc-900 tracking-tight mt-1">
                Calibrate Your Operatr
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Tell your agent what to focus on and define your hourly rate for live value metrics.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-800 block mb-1">
                  Describe your business and operational focus in 2 to 5 sentences
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. I run a B2B SaaS focused on revenue intelligence. My primary objective is monitoring competitor pricing updates and tracking buyer dissatisfaction with legacy analytics tools on X."
                  value={businessGoal}
                  onChange={(e) => setBusinessGoal(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border border-zinc-200 text-xs text-zinc-900 bg-white focus:outline-none focus:border-zinc-900 leading-relaxed"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  Processed with your core LLM and automatically loaded into your agent instructions in Settings.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-800 block mb-1">
                  Your Personal Hourly Rate ($ USD)
                </label>
                <div className="relative max-w-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-mono font-bold text-zinc-900 bg-white focus:outline-none focus:border-zinc-900"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Used after every completed task to multiply reclaimed hours into dollar returns on your dashboard.
                </p>
              </div>
            </div>

            {/* Step Controls */}
            <div className="pt-4 flex items-center justify-between border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setStep("tools")}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={handleFinishGuided}
                disabled={isInitializing}
                className="px-6 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-all flex items-center gap-1.5 shadow-sm"
              >
                {isInitializing ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    Initializing Operatr...
                  </>
                ) : (
                  <>
                    <span>Initialize Agent OS</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: AI WELCOME & ACTIVATION */}
        {step === "welcome" && (
          <div className="p-8 sm:p-10 space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mx-auto shadow-soft">
              <CheckCircle2 className="w-7 h-7 text-white" />
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">
                Operatr Initialized
              </span>
              <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mt-1">
                Welcome to Your Private OS
              </h2>
            </div>

            {/* Personalized Welcome Card */}
            <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                <Bot className="w-4 h-4" />
                <span>Operatr Core Engine Dispatch</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed font-mono">
                &ldquo;System calibrated for your focus: &lsquo;{businessGoal || "Continuous business intelligence and market monitoring"}&rsquo;. Primary engine bound to {primaryProvider.toUpperCase()} ({primaryModel}). Hourly rate logged at ${hourlyRate}/hr. Standing by for initial task delegation.&rdquo;
              </p>
            </div>

            <button
              onClick={handleEnterDashboard}
              className="w-full py-3.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 hover:shadow-soft active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span>Launch Operatr Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
