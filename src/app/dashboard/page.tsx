"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Clock,
  DollarSign,
  TrendingUp,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Filter,
  Download,
  MoreVertical,
  ShieldAlert,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardChat } from "@/components/dashboard/DashboardChat";

interface TaskRun {
  id: string;
  title: string;
  tool: string;
  status: "Completed" | "Pending Approval" | "Running";
  hoursSaved: number;
  value: number;
  date: string;
  artifactUrl?: string;
}

export default function DashboardPage() {
  const [hourlyRate, setHourlyRate] = useState(150);
  const [userConfig, setUserConfig] = useState<any>(null);

  // Live Telemetry Totals
  const [totalHoursSaved, setTotalHoursSaved] = useState(48.5);
  const [totalValue, setTotalValue] = useState(7275);
  const [tasksCount, setTasksCount] = useState(42);

  // Active View Tab in Bottom Section
  const [activeTab, setActiveTab] = useState<"chat" | "table">("chat");

  // Initial Runs Data (Reference 2 Manage Jobs Table)
  const [runs, setRuns] = useState<TaskRun[]>([
    {
      id: "run-101",
      title: "Fintech Pricing Surveillance (Stripe, Adyen, Checkout)",
      tool: "Apify Crawler + Sheets",
      status: "Completed",
      hoursSaved: 2.8,
      value: 420,
      date: "Today, 10:45 AM",
      artifactUrl: "https://docs.google.com/spreadsheets",
    },
    {
      id: "run-102",
      title: "X/Twitter High-Intent Buyer Signals for AI Dev Tools",
      tool: "X Actor + Tavily",
      status: "Pending Approval",
      hoursSaved: 3.4,
      value: 510,
      date: "Today, 08:30 AM",
    },
    {
      id: "run-103",
      title: "B2B SaaS Creator Affinity Brief (8 Creators)",
      tool: "Tavily + Google Docs",
      status: "Completed",
      hoursSaved: 1.9,
      value: 285,
      date: "Yesterday",
      artifactUrl: "https://docs.google.com/document",
    },
    {
      id: "run-104",
      title: "Competitor Career Page Crawl: AI Engineering Hires",
      tool: "Apify Web Actor",
      status: "Completed",
      hoursSaved: 2.1,
      value: 315,
      date: "2 days ago",
    },
  ]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("operatr_user_config");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setUserConfig(parsed);
          if (parsed.hourlyRate) {
            setHourlyRate(Number(parsed.hourlyRate));
            setTotalValue(Number(parsed.hourlyRate) * 48.5);
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }, []);

  return (
    <DashboardShell>
      {/* Notice Banner if Onboarding was skipped */}
      {userConfig?.skipped && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700" />
            <span>
              <strong>Exploration Mode:</strong> You skipped onboarding. Add your API keys in Integrations to enable live agent runs.
            </span>
          </div>
          <Link
            href="/integrations"
            className="px-3.5 py-1.5 rounded-xl bg-amber-900 text-white font-medium hover:bg-amber-800 transition-colors"
          >
            Configure Keys
          </Link>
        </div>
      )}

      {/* TOP SECTION: QUICK STATS (6 TALL ROUNDED CARDS - DIRECT REFERENCE 2 REPLICA) */}
      <section className="dashboard-stats order-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Quick Stats
            </h1>
            <p className="text-xs text-zinc-500">
              Your operational telemetry and capital return.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 bg-white px-3 py-1.5 rounded-full border border-zinc-200 shadow-sm">
            <span>Rate: ${hourlyRate}/hr</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: Total Hours Reclaimed */}
          <div className="p-5 rounded-3xl bg-white border border-zinc-200/90 shadow-soft flex flex-col justify-between hover:shadow-soft-lg transition-all group">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-800 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <Clock className="w-4 h-4" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold tracking-tight font-mono text-zinc-900">
                {totalHoursSaved}h
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">
                Hours Reclaimed
              </div>
            </div>
          </div>

          {/* Card 2: Total Intelligence Queries */}
          <div className="p-5 rounded-3xl bg-white border border-zinc-200/90 shadow-soft flex flex-col justify-between hover:shadow-soft-lg transition-all group">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-800 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold tracking-tight font-mono text-zinc-900">
                1.4K
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">
                Signals Filtered
              </div>
            </div>
          </div>

          {/* Card 3: Featured Capital Return Card with Black Badge + Arrow ↗ */}
          <div className="p-5 rounded-3xl bg-white border-2 border-zinc-900 shadow-soft-lg flex flex-col justify-between relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold group-hover:scale-110 transition-transform">
                ↗
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold tracking-tight font-mono text-zinc-900">
                ${Math.round(totalValue).toLocaleString()}
              </div>
              <div className="text-[11px] text-zinc-900 font-bold">
                Capital Value
              </div>
            </div>
          </div>

          {/* Card 4: Deliverables Built */}
          <div className="p-5 rounded-3xl bg-white border border-zinc-200/90 shadow-soft flex flex-col justify-between hover:shadow-soft-lg transition-all group">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-800 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold tracking-tight font-mono text-zinc-900">
                {tasksCount}
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">
                Artifacts Built
              </div>
            </div>
          </div>

          {/* Card 5: Pending Approvals */}
          <div className="p-5 rounded-3xl bg-white border border-zinc-200/90 shadow-soft flex flex-col justify-between hover:shadow-soft-lg transition-all group">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-800 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold tracking-tight font-mono text-zinc-900">
                1
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">
                Pending Approval
              </div>
            </div>
          </div>

          {/* Card 6: Efficiency Rate */}
          <div className="p-5 rounded-3xl bg-white border border-zinc-200/90 shadow-soft flex flex-col justify-between hover:shadow-soft-lg transition-all group">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-800 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold tracking-tight font-mono text-zinc-900">
                98.4%
              </div>
              <div className="text-[11px] text-zinc-500 font-medium">
                Task Accuracy
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MIDDLE SECTION: STATISTICS CHART & PENDING APPROVALS (REFERENCE 2 REPLICA) */}
      <section className="dashboard-telemetry order-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Statistics Bar Chart Card (2 Cols) */}
        <div className="telemetry-chart lg:col-span-2 p-6 sm:p-7 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                Value Telemetry History
              </h2>
              <p className="text-xs text-zinc-500">
                Monthly breakdown of reclaimed hours and capital equivalent.
              </p>
            </div>

            {/* Legend & Tooltip Reference */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-900" />
                <span className="text-zinc-600 font-medium">Reclaimed Value ($)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                <span className="text-zinc-400 font-medium">Manual Hours (h)</span>
              </div>
            </div>
          </div>

          {/* Custom Monochrome Bar Chart Visualization */}
          <div className="pt-4 pb-2">
            <div className="h-48 w-full flex items-end justify-between gap-2 sm:gap-4 px-2 border-b border-zinc-100 relative">
              {/* Highlight Pill Tooltip (Reference 2 replica at August/Run 8) */}
              <div className="absolute top-2 left-[58%] -translate-x-1/2 flex flex-col items-center pointer-events-none">
                <div className="px-3 py-1 rounded-full bg-zinc-900 text-white text-[11px] font-bold font-mono shadow-pill">
                  $1,420
                </div>
                <div className="w-0.5 h-6 bg-zinc-900 border-dashed" />
              </div>

              {[
                { month: "Jan", val: 40, hrs: 30 },
                { month: "Feb", val: 85, hrs: 65 },
                { month: "Mar", val: 50, hrs: 40 },
                { month: "Apr", val: 70, hrs: 55 },
                { month: "May", val: 55, hrs: 45 },
                { month: "Jun", val: 90, hrs: 70 },
                { month: "Jul", val: 65, hrs: 50 },
                { month: "Aug", val: 95, hrs: 80, highlighted: true },
                { month: "Sep", val: 60, hrs: 48 },
                { month: "Oct", val: 90, hrs: 72 },
                { month: "Nov", val: 45, hrs: 35 },
                { month: "Dec", val: 75, hrs: 60 },
              ].map((item) => (
                <div
                  key={item.month}
                  className="flex-1 flex flex-col items-center gap-1 group cursor-pointer h-full justify-end"
                >
                  <div className="w-full flex items-end justify-center gap-1 h-full">
                    {/* Primary Black Bar */}
                    <div
                      style={{ height: `${item.val}%` }}
                      className={`w-2.5 sm:w-3.5 rounded-t-sm transition-all duration-300 ${
                        item.highlighted
                          ? "bg-zinc-900"
                          : "bg-zinc-900/85 group-hover:bg-zinc-900"
                      }`}
                    />
                    {/* Secondary Zinc Bar */}
                    <div
                      style={{ height: `${item.hrs}%` }}
                      className="w-2.5 sm:w-3.5 rounded-t-sm bg-zinc-200 group-hover:bg-zinc-300 transition-all duration-300"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-900">
                    {item.month}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Pending Approvals Card (1 Col) - Reference 2 Replica */}
        <div className="telemetry-approvals p-6 sm:p-7 rounded-3xl bg-white border border-zinc-200/90 shadow-soft flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">
              Pending Approvals
            </h2>
            <button className="text-zinc-400 hover:text-zinc-700">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {[
              {
                brand: "Stripe",
                task: "Fee Diff Scrape & Doc Create",
                date: "Today 10:45 GMT",
                status: "Pending",
              },
              {
                brand: "X Feeds",
                task: "Export 18 Leads to Sheets",
                date: "Today 08:30 GMT",
                status: "Pending",
              },
              {
                brand: "Adyen",
                task: "Product Launch Comparison",
                date: "Yesterday 18:20 GMT",
                status: "Pending",
              },
            ].map((approval) => (
              <div
                key={approval.brand}
                className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between hover:bg-zinc-100/70 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold font-mono">
                    {approval.brand[0]}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-900">
                      {approval.brand}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {approval.date}
                    </div>
                  </div>
                </div>

                <button className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all shadow-sm">
                  {approval.status}
                </button>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-zinc-400 text-center font-mono">
            Zero actions execute without explicit authorization.
          </p>
        </div>
      </section>

      {/* BOTTOM SECTION: OPERATR AGENT CHAT & RUNS MANAGEMENT */}
      <section id="workspace" className="dashboard-workspace order-1 rounded-3xl bg-white border border-zinc-200/90 shadow-soft overflow-hidden scroll-mt-6">
        {/* Section Header with Tab Switcher */}
        <div className="px-5 sm:px-6 py-4 border-b border-zinc-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "chat"
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
              }`}
            >
              Operatr Agent Workspace
            </button>
            <button
              onClick={() => setActiveTab("table")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "table"
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
              }`}
            >
              Recent Runs & Tasks ({runs.length})
            </button>
          </div>
        </div>

        {/* TAB 1: OPERATR AGENT CHAT */}
        {activeTab === "chat" && (
          <div className="p-5 sm:p-6">
            <DashboardChat />
          </div>
        )}

        {/* TAB 2: RECENT RUNS & TASKS TABLE (REFERENCE 2 MANAGE JOBS REPLICA) */}
        {activeTab === "table" && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 text-[11px] font-mono uppercase text-zinc-400">
                    <th className="py-3 px-4">Task Directive</th>
                    <th className="py-3 px-4">Tools Executed</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Reclaimed Time</th>
                    <th className="py-3 px-4">Capital Value</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Deliverable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-zinc-900 max-w-xs truncate">
                        {run.title}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-zinc-500">
                        {run.tool}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            run.status === "Completed"
                              ? "bg-zinc-100 text-zinc-800 border border-zinc-200"
                              : run.status === "Pending Approval"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-900">
                        +{run.hoursSaved}h
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-900">
                        +${run.value}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                        {run.date}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {run.artifactUrl ? (
                          <a
                            href={run.artifactUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-900 hover:underline"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-zinc-300 font-mono text-[11px]">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
