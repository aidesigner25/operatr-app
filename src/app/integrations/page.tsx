"use client";

import React, { useState, useEffect } from "react";
import {
  Layers,
  Key,
  ShieldCheck,
  Check,
  AlertCircle,
  ExternalLink,
  Bot,
  Zap,
  Globe,
  FileText,
  Save,
  Lock,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { readOperatorConfig, writeOperatorConfig } from "@/lib/browser/operator-config";

export default function IntegrationsPage() {
  const [keys, setKeys] = useState({
    openai: "",
    anthropic: "",
    google: "",
    xai: "",
    tavily: "",
    apify: "",
    googleDocs: false,
    googleSheets: false,
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const parsed = readOperatorConfig();
      if (Object.keys(parsed).length > 0) {
        try {
          setKeys((prev) => ({
            ...prev,
            googleDocs: false,
            googleSheets: false,
          }));
        } catch (e) {}
      }
    }
  }, []);

  const handleSave = () => {
    if (typeof window !== "undefined") {
      const existing = readOperatorConfig();
      writeOperatorConfig({
        ...existing,
        needsSecureConnection: true,
        hasActiveKeys: false,
        skipped: false,
      });
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Integrations & BYOK Vault
            </h1>
            <p className="text-xs text-zinc-500">
              Manage direct API keys and tool permissions. Your keys run on native provider infrastructure.
            </p>
          </div>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 shadow-sm transition-all"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Preferences Saved</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Preferences</span>
              </>
            )}
          </button>
        </div>

        {/* Security Notice */}
        <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-soft flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-zinc-900 block">
              Secure connections are not live yet
            </span>
            <p className="text-zinc-500 leading-relaxed">
              This POC does not save or transmit keys from the browser. Server-side encrypted connections arrive with authentication in Phase 1.
            </p>
          </div>
        </div>

        {/* Section 1: LLM Engine Keys */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-zinc-100">
            <Bot className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Core LLM Providers (Connect at least one)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OpenAI */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">OpenAI API Key</span>
                <span className="text-[10px] font-mono text-zinc-400">GPT-4o, o1</span>
              </div>
              <input
                type="password"
                placeholder="sk-proj-..."
                value={keys.openai}
                onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
              />
            </div>

            {/* Anthropic */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">Anthropic API Key</span>
                <span className="text-[10px] font-mono text-zinc-400">Claude 3.5 Sonnet</span>
              </div>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={keys.anthropic}
                onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
              />
            </div>

            {/* Google Gemini */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">Google Gemini API Key</span>
                <span className="text-[10px] font-mono text-zinc-400">Gemini 1.5/2.0</span>
              </div>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={keys.google}
                onChange={(e) => setKeys({ ...keys, google: e.target.value })}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
              />
            </div>

            {/* xAI / Grok */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900">xAI / Grok API Key</span>
                <span className="text-[10px] font-mono text-zinc-400">Grok 2</span>
              </div>
              <input
                type="password"
                placeholder="xai-..."
                value={keys.xai}
                onChange={(e) => setKeys({ ...keys, xai: e.target.value })}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Research & Scraping Tools */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-zinc-100">
            <Globe className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Research & Extraction Tools
            </h2>
          </div>

          <div className="space-y-4">
            {/* Tavily */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-900 block">
                    Tavily Search API Key
                  </span>
                  <p className="text-[10px] text-zinc-500">
                    Real-time deep web synthesis and factual cross-referencing.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 bg-white px-2 py-0.5 rounded border border-zinc-200">
                  Free tier supported
                </span>
              </div>
              <input
                type="password"
                placeholder="tvly-..."
                value={keys.tavily}
                onChange={(e) => setKeys({ ...keys, tavily: e.target.value })}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
              />
            </div>

            {/* Apify */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-900 block">
                    Apify API Token
                  </span>
                  <p className="text-[10px] text-zinc-500">
                    Powers Social Signal Detection, Competitor Radar, and Partnership Finders.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Free tier may hit usage limits
                </span>
              </div>
              <input
                type="password"
                placeholder="apify_api_..."
                value={keys.apify}
                onChange={(e) => setKeys({ ...keys, apify: e.target.value })}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Google Workspace OAuth */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-zinc-100">
            <FileText className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Google Workspace (Deliverables Generation)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-900 block">
                  Google Docs
                </span>
                <span className="text-[10px] text-zinc-500">
                  Permission to create briefing docs
                </span>
              </div>
              <button
                disabled
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
                  keys.googleDocs
                    ? "bg-emerald-600 text-white flex items-center gap-1"
                    : "bg-white border border-zinc-300 text-zinc-700"
                }`}
              >
                {keys.googleDocs ? <><Check className="w-3 h-3" /> Enabled</> : "Enable"}
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-900 block">
                  Google Sheets
                </span>
                <span className="text-[10px] text-zinc-500">
                  Permission to append pipeline tables
                </span>
              </div>
              <button
                disabled
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
                  keys.googleSheets
                    ? "bg-emerald-600 text-white flex items-center gap-1"
                    : "bg-white border border-zinc-300 text-zinc-700"
                }`}
              >
                {keys.googleSheets ? <><Check className="w-3 h-3" /> Enabled</> : "Enable"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
