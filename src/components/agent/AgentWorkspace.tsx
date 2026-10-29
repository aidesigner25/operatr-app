"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, FileText, Loader2, Paperclip, Pause, Pencil, Plus, Send, Sparkles, X } from "lucide-react";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";

type Provider = "openai" | "anthropic" | "google" | "xai";
type ResponseStyle = "concise" | "medium" | "deep";
type Conversation = { id: string; title: string; provider: Provider; model: string; response_style: ResponseStyle; created_at: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant"; content: string; status?: "streaming" | "completed" | "cancelled" | "failed"; created_at: string };
type ApiResponse<T> = { data?: T; error?: { code?: string; message?: string } };

const MODELS: Record<Provider, { id: string; label: string }[]> = {
  openai: [{ id: "gpt-4o", label: "GPT-4o" }, { id: "gpt-4o-mini", label: "GPT-4o mini" }, { id: "gpt-4.1", label: "GPT-4.1" }],
  anthropic: [{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }, { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" }],
  google: [{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }, { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }],
  xai: [{ id: "grok-4", label: "Grok 4" }, { id: "grok-3-mini", label: "Grok 3 Mini" }],
};

const providerLabel: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google", xai: "xAI" };

function relativeDate(value: string) {
  const hours = Math.round((Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) return "Now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export function AgentWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("gpt-4o");
  const [customModel, setCustomModel] = useState("");
  const [style, setStyle] = useState<ResponseStyle>("medium");
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [runTrace, setRunTrace] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/chat/conversations", { cache: "no-store" });
    const payload = await readJson<ApiResponse<{ conversations: Conversation[] }>>(response);
    if (!response.ok) throw new Error(payload.error?.message || "Conversations could not be loaded.");
    setConversations(payload.data?.conversations || []);
  }, []);

  useEffect(() => {
    void (async () => {
      try { await loadConversations(); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Conversations could not be loaded."); }
      finally { setIsLoading(false); }
    })();
  }, [loadConversations]);

  const openConversation = async (conversation: Conversation) => {
    if (isRunning) return;
    setError("");
    setRunTrace("");
    setIsLoading(true);
    try {
      const response = await fetch(`/api/chat/conversations/${conversation.id}`, { cache: "no-store" });
      const payload = await readJson<ApiResponse<{ conversation: Conversation; messages: Message[] }>>(response);
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Conversation could not be loaded.");
      setActiveConversation(payload.data.conversation);
      setMessages(payload.data.messages);
      setProvider(payload.data.conversation.provider);
      setModel(payload.data.conversation.model);
      setStyle(payload.data.conversation.response_style);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Conversation could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  };

  const newChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setActiveConversation(null);
    setMessages([]);
    setPrompt("");
    setError("");
    setIsEditingTitle(false);
    setTitleDraft("");
  };

  const beginTitleEdit = () => {
    if (!activeConversation) return;
    setTitleDraft(activeConversation.title);
    setIsEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!activeConversation || isSavingTitle) return;
    const title = titleDraft.replace(/\s+/g, " ").trim();
    if (!title) {
      setError("Enter a conversation title.");
      return;
    }
    setIsSavingTitle(true);
    setError("");
    try {
      const response = await fetch(`/api/chat/conversations/${activeConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload = await readJson<ApiResponse<{ conversation: Conversation }>>(response);
      if (!response.ok || !payload.data?.conversation) throw new Error(payload.error?.message || "The conversation title could not be updated.");
      setActiveConversation(payload.data.conversation);
      setConversations((current) => current.map((conversation) => conversation.id === payload.data!.conversation.id ? payload.data!.conversation : conversation));
      setIsEditingTitle(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The conversation title could not be updated.");
    } finally {
      setIsSavingTitle(false);
    }
  };

  const persistRuntime = async (next: { provider: Provider; model: string; responseStyle: ResponseStyle }) => {
    if (!activeConversation) {
      setProvider(next.provider);
      setModel(next.model);
      setStyle(next.responseStyle);
      return;
    }
    if (isRunning) return;
    setError("");
    const response = await fetch(`/api/chat/conversations/${activeConversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const payload = await readJson<ApiResponse<{ conversation: Conversation }>>(response);
    if (!response.ok || !payload.data?.conversation) {
      setError(payload.error?.message || "The next-response settings could not be updated.");
      return;
    }
    setActiveConversation(payload.data.conversation);
    setConversations((current) => current.map((item) => item.id === payload.data!.conversation.id ? payload.data!.conversation : item));
    setProvider(payload.data.conversation.provider);
    setModel(payload.data.conversation.model);
    setStyle(payload.data.conversation.response_style);
  };

  const applyProvider = (nextProvider: Provider) => {
    const nextModel = MODELS[nextProvider][0].id;
    setCustomModel("");
    void persistRuntime({ provider: nextProvider, model: nextModel, responseStyle: activeConversation?.response_style || style });
  };

  const appendDelta = (id: string, text: string) => setMessages((current) => current.map((message) => message.id === id ? { ...message, content: message.content + text } : message));

  const send = async () => {
    const content = prompt.trim();
    if (!content || isRunning) return;
    setError("");
    setPrompt("");
    setIsRunning(true);
    setRunTrace("Preparing private context");
    const controller = new AbortController();
    abortRef.current = controller;
    const selectedModel = model === "__custom" ? `custom:${customModel.trim()}` : model;
    let conversation = activeConversation;
    const userMessage: Message = { id: `local-user-${crypto.randomUUID()}`, role: "user", content, status: "completed", created_at: new Date().toISOString() };
    const assistantId = `local-assistant-${crypto.randomUUID()}`;

    try {
      if (!conversation) {
        const created = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, model: selectedModel, responseStyle: style, firstMessage: content }),
          signal: controller.signal,
        });
        const payload = await readJson<ApiResponse<{ conversation: Conversation }>>(created);
        if (!created.ok || !payload.data?.conversation) throw new Error(payload.error?.message || "Conversation could not be created.");
        conversation = payload.data.conversation;
        setActiveConversation(conversation);
        setConversations((current) => [conversation!, ...current]);
      }
      const streamedConversationId = conversation.id;

      setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "", status: "streaming", created_at: new Date().toISOString() }]);
      const response = await fetch(`/api/chat/conversations/${streamedConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await readJson<ApiResponse<unknown>>(response);
        throw new Error(payload.error?.message || "The chat response could not be started.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalStatus: Message["status"] = "completed";
      const processEvent = (raw: string) => {
        const eventName = raw.match(/^event:\s*(.+)$/m)?.[1];
        const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data) return;
        const payload = JSON.parse(data) as { text?: string; message?: string; status?: Message["status"]; title?: string; detail?: string };
        if (eventName === "delta" && payload.text) appendDelta(assistantId, payload.text);
        if (eventName === "trace" && payload.detail) setRunTrace(payload.detail);
        if (eventName === "error") throw new Error(payload.message || "The provider could not complete this request.");
        if (eventName === "title" && payload.title) {
          const title = payload.title;
          setActiveConversation((current) => !current || current.id !== streamedConversationId ? current : { ...current, title });
          setConversations((current) => current.map((item) => item.id === streamedConversationId ? { ...item, title } : item));
        }
        if (eventName === "done") finalStatus = payload.status || "completed";
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        for (const event of events) processEvent(event);
        if (done) break;
      }
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: finalStatus } : message).filter((message) => message.id !== assistantId || message.content));
      await loadConversations();
    } catch (caught) {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "cancelled" as const } : message).filter((message) => message.id !== assistantId || message.content));
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Chat could not be completed.");
    } finally {
      abortRef.current = null;
      setIsRunning(false);
      setRunTrace("");
    }
  };

  const cancel = () => abortRef.current?.abort();
  const conversationTitle = activeConversation?.title || "New conversation";
  const currentProvider = activeConversation?.provider || provider;
  const currentModel = activeConversation?.model || (model === "__custom" ? customModel : model);

  return <div className="agent-workspace grid min-h-[calc(100vh-4rem)] grid-cols-1 overflow-hidden rounded-[1.8rem] border border-[var(--line)] bg-[var(--paper)] shadow-soft-lg lg:grid-cols-[15.5rem_minmax(0,1fr)]">
    <aside className="border-b border-[var(--line)] bg-[var(--canvas)] p-4 lg:border-b-0 lg:border-r">
      <button type="button" onClick={newChat} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-3 py-2.5 text-xs font-semibold text-[var(--paper)] transition-transform hover:-translate-y-0.5"><Plus className="w-3.5 h-3.5" /> New chat</button>
      <p className="mt-6 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--tan)]">Recent conversations</p>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
        {conversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => void openConversation(conversation)} className={`min-w-[12rem] rounded-xl px-3 py-2.5 text-left text-xs transition-colors lg:min-w-0 lg:w-full ${conversation.id === activeConversation?.id ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)] hover:bg-[rgba(255,253,247,0.7)] hover:text-[var(--ink)]"}`}><span className="block truncate font-medium">{conversation.title}</span><span className="mt-0.5 block font-mono text-[9px] opacity-60">{relativeDate(conversation.updated_at)}</span></button>)}
        {!isLoading && conversations.length === 0 && <p className="px-2 py-3 text-xs leading-relaxed text-[var(--muted-ink)]">Your secure conversation history will appear here.</p>}
      </div>
    </aside>

    <section className="flex min-h-[42rem] flex-col">
      <header className="relative overflow-hidden border-b border-[rgba(249,247,240,0.16)] bg-[var(--ink)] px-5 py-4 text-[var(--paper)] sm:px-6">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,253,247,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,253,247,0.1)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--tan-light)]">Private chat</p>{isEditingTitle ? <div className="mt-1 flex max-w-xl items-center gap-2"><input autoFocus value={titleDraft} maxLength={160} onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(); if (event.key === "Escape") setIsEditingTitle(false); }} className="w-full rounded-lg border border-[rgba(255,253,247,0.35)] bg-[rgba(255,253,247,0.1)] px-2 py-1 font-display text-xl text-[var(--paper)] outline-none" /><button type="button" onClick={() => void saveTitle()} disabled={isSavingTitle} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Save title"><Check className="h-4 w-4" /></button><button type="button" onClick={() => setIsEditingTitle(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cancel title edit"><X className="h-4 w-4" /></button></div> : <div className="flex items-center gap-2"><h1 className="truncate font-display text-2xl tracking-[-0.035em]">{conversationTitle}</h1>{activeConversation && <button type="button" onClick={beginTitleEdit} className="rounded-lg p-1.5 text-[var(--tan-light)] hover:bg-white/10 hover:text-[var(--paper)]" aria-label="Edit conversation title"><Pencil className="h-3.5 w-3.5" /></button>}</div>}</div>{isRunning && <button type="button" onClick={cancel} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--tan-wash)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"><Pause className="w-3.5 h-3.5" />Stop</button>}</div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto bg-[var(--paper)] p-5 sm:p-7 [background-image:radial-gradient(rgba(87,80,69,0.08)_0.7px,transparent_0.7px)] [background-size:18px_18px]">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="rounded-xl border border-[var(--line)] bg-[rgba(235,229,218,0.54)] px-3 py-2 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted-ink)]">{activeConversation ? `${providerLabel[activeConversation.provider]} · ${activeConversation.model} · ${activeConversation.response_style} · applies to the next response` : "Choose a provider and begin a private conversation"}</div>
          {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</div>}
          {isLoading ? <div className="flex items-center gap-3 text-xs text-[var(--muted-ink)]"><Loader2 className="h-4 w-4 animate-spin" />Loading conversations…</div> : messages.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[rgba(255,253,247,0.6)] p-7 text-center"><Sparkles className="mx-auto h-5 w-5 text-[var(--tan)]" /><p className="mt-3 text-sm font-medium">Ready when you are.</p><p className="mt-1 text-xs leading-relaxed text-[var(--muted-ink)]">Start a private conversation. No web, tool, or file actions are enabled in this phase.</p></div> : messages.map((message) => <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--ink)]"><img src="/images/operatr_icon.png" alt="Operatr" className="h-full w-full object-cover scale-[1.06]" /></span>}<div className={`max-w-[88%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${message.role === "user" ? "rounded-tr-sm bg-[var(--ink)] text-[var(--paper)]" : "rounded-tl-sm border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)]"}`}>{message.content ? message.role === "assistant" ? <ChatMarkdown content={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p> : <span className="inline-flex items-center gap-2 font-mono text-xs text-[var(--muted-ink)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{runTrace || "Preparing response"}</span>}{message.role === "assistant" && message.status === "completed" && <div className="mt-3 flex items-center gap-2 border-t border-[var(--line)] pt-3 font-mono text-[10px] text-[var(--muted-ink)]"><Check className="w-3.5 h-3.5 text-[#748260]" />Private response saved</div>}{message.status === "cancelled" && <p className="mt-2 text-[10px] font-mono text-[var(--muted-ink)]">Response stopped</p>}</div></div>)}
        </div>
      </div>

      <footer className="border-t border-[var(--line)] bg-[var(--paper)] p-4 sm:p-5"><div className="mx-auto max-w-3xl"><div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--muted-ink)]"><span className="flex items-center gap-1.5"><FileText className="h-3 w-3" />File uploads are not enabled yet</span><span>90s run limit</span><span>One pre-response retry</span><span>Provider change shares chat context</span></div><div className="rounded-2xl border border-[var(--line)] bg-[var(--canvas)] p-2 focus-within:border-[var(--tan)]"><div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-1 pb-2"><select value={currentProvider} disabled={isRunning} onChange={(event) => applyProvider(event.target.value as Provider)} aria-label="Provider" className="agent-select disabled:cursor-not-allowed disabled:opacity-70">{(Object.keys(MODELS) as Provider[]).map((option) => <option key={option} value={option}>{providerLabel[option]}</option>)}</select><select value={activeConversation ? currentModel : model} disabled={isRunning} onChange={(event) => void persistRuntime({ provider: currentProvider, model: event.target.value, responseStyle: activeConversation?.response_style || style })} aria-label="Model" className="agent-select disabled:cursor-not-allowed disabled:opacity-70">{MODELS[currentProvider].map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}{activeConversation && !MODELS[currentProvider].some((option) => option.id === currentModel) && <option value={currentModel}>{currentModel}</option>}{!activeConversation && <option value="__custom">Custom model ID…</option>}</select>{!activeConversation && model === "__custom" && <input value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="provider model ID" className="agent-select w-40" />}<select value={activeConversation ? activeConversation.response_style : style} disabled={isRunning} onChange={(event) => void persistRuntime({ provider: currentProvider, model: currentModel, responseStyle: event.target.value as ResponseStyle })} aria-label="Response effort" className="agent-select disabled:cursor-not-allowed disabled:opacity-70"><option value="concise">Concise · 800 max</option><option value="medium">Standard · 2k max</option><option value="deep">Deep · 4k max</option></select></div><div className="mt-2 flex items-center gap-2"><button type="button" disabled title="File uploads are intentionally deferred" className="cursor-not-allowed rounded-xl p-2.5 text-[var(--line)]"><Paperclip className="w-4 h-4" /></button><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} placeholder="Ask Operatr to think, decide, or create…" className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)]" disabled={isRunning} /><button type="button" onClick={() => void send()} disabled={!prompt.trim() || isRunning || (model === "__custom" && !customModel.trim())} className="rounded-xl bg-[var(--ink)] p-2.5 text-[var(--paper)] transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"><Send className="w-4 h-4" /></button></div></div></div></footer>
    </section>
  </div>;
}
