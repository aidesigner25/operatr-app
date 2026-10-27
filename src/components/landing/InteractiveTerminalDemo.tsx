"use client";

import React, { useState, useEffect } from "react";
import {
  Play,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  ExternalLink,
  Bot,
  Send,
  Clock,
  DollarSign,
  Check,
} from "lucide-react";

interface Step {
  status: string;
  detail: string;
  duration: number;
}

interface DemoTask {
  title: string;
  tabLabel: string;
  prompt: string;
  tools: string;
  artifactType: "sheet" | "doc";
  artifactTitle: string;
  artifactUrl: string;
  steps: Step[];
  hours: string;
  value: string;
}

const DEMO_TASKS: DemoTask[] = [
  {
    title: "Fintech Competitor Pricing Surveillance",
    tabLabel: "1. Pricing Radar",
    prompt:
      "Take a look at Stripe, Adyen, and PayPal and make me a comparison sheet on ease of integration and fee amounts per transaction. Include one final recommendation on which I should use for my clients and why.",
    tools: "Apify Crawler + Google Sheets",
    artifactType: "sheet",
    artifactTitle: "Fintech_Pricing_Radar_Q4.xlsx",
    artifactUrl: "https://docs.google.com/spreadsheets",
    steps: [
      { status: "Contemplating", detail: "Formulating crawl strategy & parsing target DOMs", duration: 1100 },
      { status: "Running Research", detail: "Scraping 3 competitor pricing schemas via Apify", duration: 1500 },
      { status: "Synthesizing Intelligence", detail: "Detected 0.15% fee cut on European volume", duration: 1300 },
      { status: "Creating Materials", detail: "Generated Google Sheet with side-by-side comparison", duration: 1200 },
      { status: "Calculating Value", detail: "Logged +2.4 hrs saved ($360.00 equivalent return)", duration: 800 },
    ],
    hours: "2.4 hrs",
    value: "$360.00",
  },
  {
    title: "X/Twitter High-Intent Buyer Signals",
    tabLabel: "2. Social Signals",
    prompt:
      "Research 2026 data on the 5 biggest mistakes fintech startups are making around agentic AI and find me 15 fintech leads I can reach out to around these pain points.",
    tools: "X Actor + Tavily Enrich",
    artifactType: "sheet",
    artifactTitle: "Enterprise_AI_Leads_Pipeline.xlsx",
    artifactUrl: "https://docs.google.com/spreadsheets",
    steps: [
      { status: "Contemplating", detail: "Targeting semantic pain points: BYOK, prompt leak, DLP", duration: 1000 },
      { status: "Running Research", detail: "Parsed 420 recent posts; filtered 18 high-confidence leads", duration: 1400 },
      { status: "Synthesizing Intelligence", detail: "Ranked opportunities by authority & funding stage", duration: 1300 },
      { status: "Creating Materials", detail: "Populated pipeline tracking sheet with verified contacts", duration: 1200 },
      { status: "Calculating Value", detail: "Logged +3.1 hrs saved ($465.00 equivalent return)", duration: 800 },
    ],
    hours: "3.1 hrs",
    value: "$465.00",
  },
  {
    title: "Creator Partnership Affinity Scoring",
    tabLabel: "3. Creator Search",
    prompt:
      "Find me 8 top creators on X with over 20k followers who talk about wealth creation. Share this as a list and draft me a personalized outreach template I can use in the style of Alex Hormozi.",
    tools: "Tavily Search + Google Docs",
    artifactType: "doc",
    artifactTitle: "Creator_Partnership_Brief.gdoc",
    artifactUrl: "https://docs.google.com/document",
    steps: [
      { status: "Contemplating", detail: "Mapping niche synergy with Operatr value pillars", duration: 1000 },
      { status: "Running Research", detail: "Synthesizing cross-platform audience engagement", duration: 1400 },
      { status: "Synthesizing Intelligence", detail: "Scored 8 creator profiles with 91%+ audience alignment", duration: 1300 },
      { status: "Creating Materials", detail: "Drafted personalized outreach brief in Google Docs", duration: 1200 },
      { status: "Calculating Value", detail: "Logged +1.9 hrs saved ($285.00 equivalent return)", duration: 800 },
    ],
    hours: "1.9 hrs",
    value: "$285.00",
  },
];

export function InteractiveTerminalDemo() {
  const [selectedTaskIdx, setSelectedTaskIdx] = useState(0);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const activeTask = DEMO_TASKS[selectedTaskIdx];

  const runSimulation = () => {
    setIsRunning(true);
    setIsCompleted(false);
    setActiveStepIdx(0);
  };

  useEffect(() => {
    if (!isRunning) return;

    if (activeStepIdx < activeTask.steps.length) {
      const timer = setTimeout(() => {
        setActiveStepIdx((prev) => prev + 1);
      }, activeTask.steps[activeStepIdx].duration);
      return () => clearTimeout(timer);
    } else {
      setIsRunning(false);
      setIsCompleted(true);
    }
  }, [isRunning, activeStepIdx, activeTask]);

  return (
    <div className="w-full max-w-4xl mx-auto rounded-[2rem] bg-[var(--paper)] border border-[var(--line)] shadow-soft-lg overflow-hidden transition-all hover:shadow-[0_28px_70px_-35px_rgba(61,55,45,0.35)]">
      {/* Top Chat Header */}
      <div className="px-5 sm:px-6 py-4 bg-[var(--canvas)] border-b border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative overflow-hidden">
        <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[var(--tan)]/50 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl overflow-hidden shadow-sm">
              <img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg tracking-[-0.03em] text-[var(--ink)]">
                Operatr Core Workspace
              </span>
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-[var(--muted-ink)] bg-[var(--paper)] px-2 py-0.5 rounded-md border border-[var(--line)]">
                Live Execution
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-ink)]">
              Chaining: {activeTask.tools}
            </p>
          </div>
        </div>

        {/* Task Tabs (Styled like clean conversation sessions) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--sand)] overflow-x-auto">
          {DEMO_TASKS.map((task, idx) => (
            <button
              key={task.title}
              onClick={() => {
                setSelectedTaskIdx(idx);
                setIsRunning(false);
                setIsCompleted(false);
                setActiveStepIdx(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                selectedTaskIdx === idx
                  ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted-ink)] hover:text-[var(--ink)]"
              }`}
            >
              {task.tabLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Conversation Body */}
      <div className="p-5 sm:p-8 space-y-6 bg-[var(--paper)] min-h-[420px] flex flex-col justify-between [background-image:radial-gradient(rgba(87,80,69,0.09)_0.7px,transparent_0.7px)] [background-size:18px_18px]">
        <div className="space-y-5">
          {/* User Message Bubble */}
          <div className="flex justify-end">
            <div className="max-w-xl rounded-2xl rounded-tr-sm bg-[var(--ink)] text-[var(--paper)] p-4 shadow-sm space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--tan-light)] block font-semibold">
                User Directive
              </span>
              <p className="text-xs sm:text-sm font-medium leading-relaxed">
                {activeTask.prompt}
              </p>
            </div>
          </div>

          {/* Operatr Agent Response Bubble */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0 mt-1 shadow-sm">
              <img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" />
            </div>

            <div className="flex-1 max-w-2xl rounded-2xl rounded-tl-sm bg-[var(--canvas)] border border-[var(--line)] p-5 space-y-4 shadow-sm">
              {/* Agent Status Heading */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--ink)]">
                    Operatr Agent
                  </span>
                  {isRunning && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-[var(--ink)] text-[var(--paper)]">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      Running
                    </span>
                  )}
                  {isCompleted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold">
                      <Check className="w-3 h-3" /> Complete
                    </span>
                  )}
                </div>

                <span className="text-[10px] font-mono text-[var(--muted-ink)]">
                  Model: gpt-4o / sonnet 3.5
                </span>
              </div>

              {/* Sequential 5-Step Pipeline (Presented as clean chat milestones) */}
              <div className="space-y-2">
                {activeTask.steps.map((step, idx) => {
                  const isCurrent = isRunning && activeStepIdx === idx;
                  const isDone = isCompleted || activeStepIdx > idx;

                  return (
                    <div
                      key={step.status}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all duration-300 ${
                        isCurrent
                          ? "bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-sm"
                          : isDone
                          ? "bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]"
                          : "bg-transparent border-transparent text-[var(--muted-ink)] opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold ${
                            isCurrent
                              ? "bg-[var(--paper)] text-[var(--ink)] animate-pulse"
                              : isDone
                              ? "bg-[var(--ink)] text-[var(--paper)]"
                              : "bg-[var(--sand)] text-[var(--muted-ink)]"
                          }`}
                        >
                          {isDone ? <Check className="w-3 h-3" /> : idx + 1}
                        </div>
                        <span className="font-semibold">{step.status}:</span>
                        <span className={isCurrent ? "text-[var(--tan-light)]" : isDone ? "text-[var(--muted-ink)]" : "text-[var(--muted-ink)]"}>
                          {step.detail}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Deliverable Card Preview (Appears when step 4+ reached or completed) */}
              {(isCompleted || activeStepIdx >= 3) && (
                <div className="pt-2 animate-fade-in">
                  <div className="p-3.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                        {activeTask.artifactType === "sheet" ? (
                          <FileSpreadsheet className="w-4 h-4" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[var(--ink)] block">
                          {activeTask.artifactTitle}
                        </span>
                        <span className="text-[10px] text-[var(--muted-ink)] font-mono">
                          Ready for download or live editing
                        </span>
                      </div>
                    </div>

                    <a
                      href={activeTask.artifactUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--sand)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-all flex items-center gap-1"
                    >
                      <span>Open Asset</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Telemetry Badge (Appears when completed) */}
              {(isCompleted || activeStepIdx >= 4) && (
                <div className="flex items-center justify-between pt-2 border-t border-[var(--line)] text-xs font-mono">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>+{activeTask.hours} manual time saved</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-[var(--ink)]">
                    <DollarSign className="w-3.5 h-3.5 text-[var(--muted-ink)]" />
                    <span>+{activeTask.value} capital return</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Interactive Input Bar */}
        <div className="pt-4 border-t border-[var(--line)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={runSimulation}
              disabled={isRunning}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all flex items-center justify-center gap-2 shadow-sm ${
                isRunning
                  ? "bg-[var(--sand)] text-[var(--muted-ink)] cursor-not-allowed"
                  : "bg-[var(--ink)] text-[var(--paper)] hover:-translate-y-0.5 active:scale-[0.98]"
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Executing Task...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Pipeline Simulation</span>
                </>
              )}
            </button>
            <span className="text-[11px] font-mono text-[var(--muted-ink)] hidden sm:inline">
              Simulates live multi-tool dispatch
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[var(--muted-ink)]">
            <span>Avg completion: 6.2s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
