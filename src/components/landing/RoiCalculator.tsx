"use client";

import React, { useState } from "react";
import { DollarSign, Clock, TrendingUp, Sparkles } from "lucide-react";

export function RoiCalculator() {
  const [hourlyRate, setHourlyRate] = useState(150);
  const [tasksPerWeek, setTasksPerWeek] = useState(12);

  // Average 2.2 manual hours saved per task by Operatr agent
  const hoursSavedPerWeek = tasksPerWeek * 2.2;
  const hoursSavedPerMonth = Math.round(hoursSavedPerWeek * 4.33);
  const monthlyValue = Math.round(hoursSavedPerMonth * hourlyRate);
  const annualValue = Math.round(monthlyValue * 12);

  return (
    <div className="w-full max-w-5xl mx-auto rounded-[2rem] bg-[var(--paper)] border border-[var(--line)] shadow-soft-lg p-6 sm:p-10 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--tan)]/50 to-transparent" />
      <div className="absolute -right-36 -top-36 h-80 w-80 rounded-full bg-[var(--tan-wash)] blur-3xl" />
      <div className="relative text-center max-w-xl mx-auto mb-8">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--muted-ink)] font-medium">
          Deterministic Value Telemetry
        </span>
        <h3 className="font-display text-4xl sm:text-5xl tracking-[-0.04em] text-[var(--ink)] mt-1">
          Calculate Your Reclaimed Capital
        </h3>
        <p className="text-sm text-[var(--muted-ink)] mt-2">
          Estimate how much manual research, data entry, and synthesis time you convert back into earnings each month.
        </p>
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 items-stretch">
        {/* Sliders on Left */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-[var(--canvas)] border border-[var(--line)] space-y-3 transition-colors hover:bg-[var(--paper)]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--ink)]">
                Your Billable / Executive Hourly Rate
              </label>
              <span className="text-base font-bold font-mono text-[var(--ink)]">
                ${hourlyRate} / hr
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              className="w-full h-2 bg-[var(--line)] rounded-lg appearance-none cursor-pointer accent-[var(--ink)]"
            />
            <div className="flex justify-between text-[10px] font-mono text-[var(--muted-ink)]">
              <span>$50/hr</span>
              <span>$250/hr</span>
              <span>$500/hr</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--canvas)] border border-[var(--line)] space-y-3 transition-colors hover:bg-[var(--paper)]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--ink)]">
                Weekly Delegated Tasks
              </label>
              <span className="text-base font-bold font-mono text-[var(--ink)]">
                {tasksPerWeek} workflows / wk
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="40"
              step="1"
              value={tasksPerWeek}
              onChange={(e) => setTasksPerWeek(Number(e.target.value))}
              className="w-full h-2 bg-[var(--line)] rounded-lg appearance-none cursor-pointer accent-[var(--ink)]"
            />
            <div className="flex justify-between text-[10px] font-mono text-[var(--muted-ink)]">
              <span>3 tasks</span>
              <span>20 tasks</span>
              <span>40 tasks</span>
            </div>
          </div>
        </div>

        {/* Output Cards on Right */}
        <div className="space-y-4">
          <div className="p-6 rounded-[1.6rem] bg-[var(--ink)] text-[var(--paper)] shadow-[0_20px_45px_-20px_rgba(61,55,45,0.7)] space-y-4 relative overflow-hidden">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(135deg,black,transparent_75%)]" />
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <DollarSign className="w-24 h-24 text-[var(--paper)]" />
            </div>

            <div className="relative flex items-center gap-2 text-[var(--tan-light)] text-xs font-mono uppercase tracking-wider">
              <TrendingUp className="w-4 h-4 text-[#afbd8c]" />
              <span>Projected Monthly Value</span>
            </div>

            <div className="relative">
              <div className="text-4xl sm:text-5xl font-extrabold tracking-tight font-mono text-[var(--paper)]">
                ${monthlyValue.toLocaleString()}
              </div>
              <p className="text-xs text-[var(--tan-light)] mt-1">
                Estimated annualized return of ${annualValue.toLocaleString()}
              </p>
            </div>

            <div className="relative pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-mono text-[var(--tan-light)] block">
                  Monthly Reclaimed Time
                </span>
                <span className="text-lg font-bold font-mono text-[var(--paper)] flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-4 h-4 text-[var(--tan-light)]" />
                  {hoursSavedPerMonth} hours
                </span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-[var(--tan-light)] block">
                  Weekly Output Lift
                </span>
                <span className="text-lg font-bold font-mono text-[var(--paper)] flex items-center gap-1.5 mt-0.5">
                  <Sparkles className="w-4 h-4 text-[var(--tan-light)]" />
                  +{Math.round(hoursSavedPerWeek)} hrs/wk
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--muted-ink)] text-center font-mono">
            BYOK pricing model: You pay zero platform fees on model tokens.
          </p>
        </div>
      </div>
    </div>
  );
}
