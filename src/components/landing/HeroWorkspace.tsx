import { ArrowUpRight, Check, FileText, Search, Sparkles } from "lucide-react";

export function HeroWorkspace() {
  return (
    <div className="hero-workspace relative mx-auto w-full max-w-[34rem] rounded-[1.8rem] border border-[var(--line)] bg-[rgba(255,253,247,0.74)] p-2 shadow-[0_28px_80px_-34px_rgba(61,55,45,0.36)] backdrop-blur-xl">
      <div className="overflow-hidden rounded-[1.35rem] border border-[rgba(110,100,83,0.16)] bg-[var(--paper)]">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(245,241,233,0.75)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ink)] text-[var(--paper)]"><Sparkles className="h-3.5 w-3.5" /></span>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">Operatr / live brief</p>
              <p className="text-xs font-semibold text-[var(--ink)]">Intelligence workspace</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-[rgba(137,119,87,0.22)] bg-[var(--tan-wash)] px-2 py-1 font-mono text-[9px] text-[var(--muted-ink)]"><span className="h-1.5 w-1.5 rounded-full bg-[#748260]" /> secure run</span>
        </header>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[var(--ink)] px-4 py-3 text-[12px] leading-relaxed text-[var(--paper)] shadow-sm">
            Research our top competitors&apos; pricing changes and prepare a decision-ready brief.
          </div>

          <div className="max-w-[94%] rounded-2xl rounded-tl-sm border border-[var(--line)] bg-[var(--canvas)] p-4 shadow-[0_8px_20px_-16px_rgba(61,55,45,0.35)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--muted-ink)]">Operatr agent</span>
              <span className="inline-flex items-center gap-1 font-mono text-[9px] text-[#647052]"><span className="h-1.5 w-1.5 rounded-full bg-[#748260]" /> routing tools</span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--ink)]">I&apos;ve mapped the research plan and am verifying pricing, product updates, and market response.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {["Web research", "Page diffs", "Brief draft"].map((label, index) => (
                <div key={label} className={`rounded-lg border px-2 py-2 ${index === 2 ? "border-[rgba(116,130,96,0.32)] bg-[rgba(116,130,96,0.08)]" : "border-[var(--line)] bg-[var(--paper)]"}`}>
                  <div className="mb-1 flex items-center justify-between"><Search className="h-3 w-3 text-[var(--tan)]" /> {index === 2 && <Check className="h-3 w-3 text-[#647052]" />}</div>
                  <span className="block text-[9px] font-medium leading-tight text-[var(--muted-ink)]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[rgba(231,225,212,0.48)] p-3">
            <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--paper)] text-[var(--tan)]"><FileText className="h-4 w-4" /></span><div><p className="text-[11px] font-semibold text-[var(--ink)]">Competitive brief</p><p className="font-mono text-[9px] text-[var(--muted-ink)]">Ready for review</p></div></div>
            <ArrowUpRight className="h-4 w-4 text-[var(--muted-ink)]" />
          </div>
        </div>
      </div>
      <div className="absolute -bottom-4 -left-3 hidden rounded-xl border border-[var(--line)] bg-[rgba(255,253,247,0.88)] px-3 py-2 shadow-soft backdrop-blur md:block"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted-ink)]">Value telemetry</p><p className="mt-0.5 text-xs font-semibold text-[var(--ink)]">+2.4 hrs reclaimed</p></div>
    </div>
  );
}
