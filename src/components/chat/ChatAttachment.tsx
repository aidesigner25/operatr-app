"use client";
import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { ATTACHMENT_BYTE_LIMIT, ATTACHMENT_CHAR_LIMIT, PDF_BYTE_LIMIT, attachmentSecurityIssue, decodeAttachmentMessage, validateAttachment, type ChatAttachment } from "@/lib/shared/chat-attachment";

export function AttachmentPicker({ attachment, onChange, onError, onReadingChange, disabled }: { attachment: ChatAttachment | null; onChange: (value: ChatAttachment | null) => void; onError: (message: string) => void; onReadingChange: (reading: boolean) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  async function select(file?: File) {
    if (!file) return;
    onError("");
    const pdf = /\.pdf$/i.test(file.name);
    if (file.size > (pdf ? PDF_BYTE_LIMIT : ATTACHMENT_BYTE_LIMIT)) { onError(pdf ? "Choose a PDF no larger than 2 MB." : "Choose a text file no larger than 64 KB."); return; }
    setReading(true); onReadingChange(true);
    try {
      let text: string;
      if (pdf) {
        const response = await fetch("/api/chat/attachments/pdf", { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
        const payload = await response.json() as { data?: { text?: string }; error?: { message?: string } };
        if (!response.ok || typeof payload.data?.text !== "string") throw new Error(payload.error?.message || "The PDF could not be read.");
        text = payload.data.text;
      } else {
        text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      }
      const value = validateAttachment({ name: file.name, text });
      if (!value) throw new Error(`Use a supported nonempty file with at most ${ATTACHMENT_CHAR_LIMIT.toLocaleString()} characters of extracted text.`);
      if (attachmentSecurityIssue(value.text)) throw new Error("This file contains instructions that attempt to control the assistant or expose secrets. Remove that content and try again.");
      onChange(value);
    } catch (error) { onError(error instanceof Error ? error.message : "This file could not be read."); }
    finally { setReading(false); onReadingChange(false); }
  }
  return <div className="space-y-2"><input ref={input} type="file" accept=".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf" className="sr-only" disabled={disabled || reading} onChange={(event) => { void select(event.target.files?.[0]); event.target.value = ""; }} /><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={disabled || reading} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[10px] font-semibold text-[var(--muted-ink)] hover:border-[var(--tan)] disabled:opacity-50"><Paperclip className="h-3.5 w-3.5" />{reading ? "Reading PDF…" : attachment ? "Replace file" : "Attach file"}</button>{attachment && <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-[var(--sand)] px-2 py-1 text-[10px]"><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{attachment.name}</span><button type="button" disabled={disabled || reading} onClick={() => onChange(null)} aria-label="Remove attachment" className="rounded p-0.5 hover:bg-black/10"><X className="h-3 w-3" /></button></span>}</div><p className="text-[10px] leading-relaxed text-[var(--muted-ink)]">PDF: up to 2 MB, 25 pages, and 20,000 characters of selectable text. Text files: up to 64 KB. Image-only PDFs need OCR and aren’t supported yet.</p>{attachment && <p className="text-[10px] leading-relaxed text-[var(--muted-ink)]">File text is saved with this conversation and shared with the selected model. Recent chat context, including file text, may also be sent to a different provider if you switch models.</p>}</div>;
}

export function UserMessage({ content }: { content: string }) {
  const parsed = decodeAttachmentMessage(content);
  if (!parsed) return <p className="whitespace-pre-wrap">{content}</p>;
  return <div className="space-y-2"><p className="whitespace-pre-wrap">{parsed.prompt}</p><details className="rounded-lg border border-white/25 px-2.5 py-2 text-xs"><summary className="cursor-pointer break-all">Attached: {parsed.attachment.name}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">{parsed.attachment.text}</pre></details></div>;
}
