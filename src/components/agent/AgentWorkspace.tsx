"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Check, FileText, Loader2, Paperclip, Pause, Plus, Send, Sparkles } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string; createdAt: string };

const THREADS = [
  "Competitor pricing surveillance",
  "Q4 buyer-signal report",
  "Creator partnership brief",
  "Weekly market summary",
];

export function AgentWorkspace() {
  const [activeThread, setActiveThread] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [style, setStyle] = useState("medium");
  const [isRunning, setIsRunning] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "I’m ready to research, synthesize, and create a decision-ready asset. What would you like to delegate?", createdAt: "Now" }]);
  const timer = useRef<number | null>(null);

  const send = () => {
    if (!prompt.trim() || isRunning) return;
    const task = prompt.trim();
    setMessages((current) => [...current, { role: "user", content: task, createdAt: "Now" }]);
    setPrompt("");
    setIsRunning(true);
    timer.current = window.setTimeout(() => {
      setMessages((current) => [...current, { role: "assistant", content: style === "concise" ? "Research complete. I found the key changes and prepared a concise brief." : style === "medium" ? "I completed the research pass, verified the strongest signals, and assembled a decision-ready brief with recommended next actions." : "Deep-work pass complete. I evaluated the available evidence, reconciled conflicting signals, and prepared a strategic brief with priorities, risks, and recommended actions.", createdAt: "Now" }]);
      setIsRunning(false);
      timer.current = null;
    }, 1700);
  };

  const pause = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setIsRunning(false);
    setMessages((current) => [...current, { role: "assistant", content: "Task paused. Your current thread and attached context are preserved.", createdAt: "Now" }]);
  };

  const newChat = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setIsRunning(false);
    setPrompt("");
    setFiles([]);
    setMessages([{ role: "assistant", content: "New workspace ready. Add a task, a source file, or a question to begin.", createdAt: "Now" }]);
  };

  const attach = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) setFiles((current) => [...current, ...Array.from(selectedFiles).map((file) => file.name)]);
  };

  return <div className="agent-workspace grid min-h-[calc(100vh-4rem)] grid-cols-1 overflow-hidden rounded-[1.8rem] border border-[var(--line)] bg-[var(--paper)] shadow-soft-lg lg:grid-cols-[15.5rem_minmax(0,1fr)]">
    <aside className="border-b border-[var(--line)] bg-[var(--canvas)] p-4 lg:border-b-0 lg:border-r">
      <button onClick={newChat} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-3 py-2.5 text-xs font-semibold text-[var(--paper)] transition-transform hover:-translate-y-0.5"><Plus className="w-3.5 h-3.5" /> New chat</button>
      <p className="mt-6 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--tan)]">Recent conversations</p>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
        {THREADS.map((thread, index) => <button key={thread} onClick={() => setActiveThread(index)} className={`min-w-[12rem] rounded-xl px-3 py-2.5 text-left text-xs transition-colors lg:min-w-0 lg:w-full ${index === activeThread ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)] hover:bg-[rgba(255,253,247,0.7)] hover:text-[var(--ink)]"}`}><span className="block truncate font-medium">{thread}</span><span className="mt-0.5 block font-mono text-[9px] opacity-60">{index === 0 ? "Today" : `${index + 1} days ago`}</span></button>)}
      </div>
    </aside>

    <section className="flex min-h-[42rem] flex-col">
      <header className="relative overflow-hidden border-b border-[rgba(249,247,240,0.16)] bg-[var(--ink)] px-5 py-4 text-[var(--paper)] sm:px-6">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,253,247,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,253,247,0.1)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--tan-light)]">Agent workspace</p><h1 className="font-display text-2xl tracking-[-0.035em]">{THREADS[activeThread]}</h1></div><div className="flex flex-wrap gap-2"><select value={model} onChange={(event) => setModel(event.target.value)} className="agent-select"><option value="gpt-4o">OpenAI · GPT-4o</option><option value="claude-3-5-sonnet">Anthropic · Claude 3.5</option><option value="gemini-1.5-pro">Google · Gemini Pro</option><option value="grok-2">xAI · Grok 2</option></select><select value={style} onChange={(event) => setStyle(event.target.value)} className="agent-select"><option value="concise">Concise · quick asks</option><option value="medium">Medium · agentic work</option><option value="deep">Deep work · strategic</option></select>{isRunning && <button onClick={pause} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--tan-wash)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"><Pause className="w-3.5 h-3.5" />Pause</button>}</div></div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto bg-[var(--paper)] p-5 sm:p-7 [background-image:radial-gradient(rgba(87,80,69,0.08)_0.7px,transparent_0.7px)] [background-size:18px_18px]">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="rounded-xl border border-[var(--line)] bg-[rgba(235,229,218,0.54)] px-3 py-2 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted-ink)]">{style === "concise" ? "Quick questions · low-demand tasks" : style === "medium" ? "Moderate reasoning · agentic task chains" : "Deep work · strategic synthesis · maximum intelligence"}</div>
          {messages.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--ink)] text-[var(--paper)]"><Sparkles className="w-3.5 h-3.5" /></span>}<div className={`max-w-[88%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${message.role === "user" ? "rounded-tr-sm bg-[var(--ink)] text-[var(--paper)]" : "rounded-tl-sm border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)]"}`}><p>{message.content}</p>{message.role === "assistant" && index > 0 && <div className="mt-3 flex items-center gap-2 border-t border-[var(--line)] pt-3 font-mono text-[10px] text-[var(--muted-ink)]"><Check className="w-3.5 h-3.5 text-[#748260]" /> Research state saved <span>·</span><FileText className="w-3.5 h-3.5 text-[var(--tan)]" /> Brief ready</div>}</div></div>)}
          {isRunning && <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--ink)] text-[var(--paper)]"><Loader2 className="w-4 h-4 animate-spin" /></span><span className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-mono text-[var(--tan-light)]">Routing tools and building your answer…</span></div>}
        </div>
      </div>

      <footer className="border-t border-[var(--line)] bg-[var(--paper)] p-4 sm:p-5"><div className="mx-auto max-w-3xl">{files.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{files.map((file) => <span key={file} className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--canvas)] px-2 py-1 font-mono text-[9px] text-[var(--muted-ink)]"><FileText className="w-3 h-3" />{file}</span>)}</div>}<div className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--canvas)] p-2 focus-within:border-[var(--tan)]"><label title="Attach source file" className="cursor-pointer rounded-xl p-2.5 text-[var(--tan)] hover:bg-[var(--tan-wash)]"><Paperclip className="w-4 h-4" /><input type="file" multiple onChange={attach} className="hidden" /></label><input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === "Enter" && send()} placeholder="Ask Operatr to research, decide, or create…" className="min-w-0 flex-1 bg-transparent px-1 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)]" disabled={isRunning} /><button onClick={send} disabled={!prompt.trim() || isRunning} className="rounded-xl bg-[var(--ink)] p-2.5 text-[var(--paper)] transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"><Send className="w-4 h-4" /></button></div></div></footer>
    </section>
  </div>;
}
