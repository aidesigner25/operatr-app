"use client";

import { useState } from "react";
import { ExternalLink, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

type ExportResult = { url: string; partial: boolean; message?: string };
export function GoogleExport({ messageId }: { messageId: string }) {
  const [busy, setBusy] = useState<"doc" | "sheet" | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState("");
  async function run(kind: "doc" | "sheet") {
    if (busy) return;
    setBusy(kind); setError(""); setResult(null);
    try {
      const response = await fetch("/api/google-workspace/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, kind }) });
      const payload = await response.json() as { data?: ExportResult; error?: { message?: string } };
      if (!response.ok || !payload.data?.url) throw new Error(payload.error?.message || "Export could not be completed.");
      const url = new URL(payload.data.url);
      if (url.origin !== "https://docs.google.com") throw new Error("Google returned an invalid file link.");
      setResult(payload.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Export could not be completed."); }
    finally { setBusy(null); }
  }
  return <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3 text-xs">
    <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] text-[var(--muted-ink)]">Export response:</span><button type="button" disabled={busy !== null} onClick={() => void run("doc")} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 font-semibold hover:border-[var(--tan)] disabled:opacity-50">{busy === "doc" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}Google Doc</button><button type="button" disabled={busy !== null} onClick={() => void run("sheet")} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 font-semibold hover:border-[var(--tan)] disabled:opacity-50">{busy === "sheet" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}Google Sheet</button></div>
    <p className="text-[10px] leading-relaxed text-[var(--muted-ink)]">Creates a new file with formatted headings, text, and links. Tables are preserved in Docs and arranged into styled cells in Sheets.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {result && <p className={result.partial ? "text-amber-800" : "text-[#526448]"}>{result.partial ? result.message : "File created."} <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">Open in Google <ExternalLink className="h-3 w-3" /></a></p>}
  </div>;
}
