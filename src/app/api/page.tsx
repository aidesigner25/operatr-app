"use client";

import React, { useState } from "react";
import {
  Code2,
  Key,
  Copy,
  Check,
  Terminal,
  Send,
  Webhook,
  Sparkles,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function ApiDocsPage() {
  const [apiKey, setApiKey] = useState("opr_example_key");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedTs, setCopiedTs] = useState(false);

  const [testPrompt, setTestPrompt] = useState(
    "Scan fintech competitor pricing updates and generate summary doc."
  );
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const curlExample = `curl -X POST https://app.operatr.ai/api/v1/run \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Scan fintech competitor pricing updates and generate summary doc.",
    "tools": ["apify", "tavily", "google_docs"],
    "model": "gpt-4o"
  }'`;

  const tsExample = `import { OperatrClient } from "@operatr/sdk";

const operatr = new OperatrClient({
  apiKey: "${apiKey}",
});

const run = await operatr.run({
  prompt: "Scan fintech competitor pricing updates and generate summary doc.",
  tools: ["apify", "tavily", "google_docs"],
});

console.log(run.hoursSaved, run.artifactUrl);`;

  const copyToClipboard = (text: string, type: "key" | "curl" | "ts") => {
    navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (type === "curl") {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } else {
      setCopiedTs(true);
      setTimeout(() => setCopiedTs(false), 2000);
    }
  };

  const handleRunTest = () => {
    setIsTesting(true);
    setTestResult(null);

    setTimeout(() => {
      setIsTesting(false);
      setTestResult(
        JSON.stringify(
          {
            status: "success",
            runId: `run_${Date.now()}`,
            hoursSaved: 2.4,
            dollarValue: 360.0,
            artifact: {
              type: "google_doc",
              url: "https://docs.google.com/document/d/opr_sample_report",
              title: "Fintech_Pricing_Radar.gdoc",
            },
            modelUsed: "gpt-4o",
            completedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
    }, 1800);
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Developer API & Webhooks
            </h1>
            <p className="text-xs text-zinc-500">
              Trigger Operatr workflows programmatically from your CRMs, scrapers, or internal codebases.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold">
              API v1 Live
            </span>
          </div>
        </div>

        {/* API Key Box */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-900" />
              <h2 className="text-sm font-bold text-zinc-900">
                Personal Secret API Token
              </h2>
            </div>
            <button
              onClick={() =>
                setApiKey(`opr_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`)
              }
              className="text-[11px] font-mono text-zinc-500 hover:text-zinc-900 underline"
            >
              Roll New Token
            </button>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-2xl bg-zinc-50 border border-zinc-200">
            <input
              type="text"
              readOnly
              value={apiKey}
              className="w-full bg-transparent px-3 text-xs font-mono text-zinc-800 focus:outline-none"
            />
            <button
              onClick={() => copyToClipboard(apiKey, "key")}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-all flex items-center gap-1.5 shrink-0"
            >
              {copiedKey ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Snippets (cURL & TypeScript) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* cURL */}
          <div className="p-6 rounded-3xl bg-zinc-900 text-white shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                cURL Execution
              </span>
              <button
                onClick={() => copyToClipboard(curlExample, "curl")}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
              >
                {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCurl ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <pre className="text-xs font-mono text-zinc-300 bg-black/50 p-4 rounded-2xl overflow-x-auto leading-relaxed border border-zinc-800">
              {curlExample}
            </pre>
          </div>

          {/* TypeScript */}
          <div className="p-6 rounded-3xl bg-zinc-900 text-white shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                TypeScript SDK
              </span>
              <button
                onClick={() => copyToClipboard(tsExample, "ts")}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
              >
                {copiedTs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTs ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <pre className="text-xs font-mono text-zinc-300 bg-black/50 p-4 rounded-2xl overflow-x-auto leading-relaxed border border-zinc-800">
              {tsExample}
            </pre>
          </div>
        </div>

        {/* Interactive Endpoint Test Runner */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <Terminal className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Interactive Test Console (/api/v1/run)
            </h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-800 block mb-1">
                Prompt Payload
              </label>
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs font-mono text-zinc-900 bg-white"
              />
            </div>

            <button
              onClick={handleRunTest}
              disabled={isTesting}
              className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching API Request...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test Request</span>
                </>
              )}
            </button>

            {testResult && (
              <div className="mt-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-800 overflow-x-auto">
                <div className="text-[10px] text-zinc-400 uppercase font-bold mb-2">
                  HTTP 200 Response Payload
                </div>
                <pre>{testResult}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
