"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Globe2, Loader2, Pause, Pencil, Plus, Send, X } from "lucide-react";
import { continuationMarkdown } from "@/lib/shared/continuation-markdown";
import { isContinuationRequest } from "@/lib/shared/task-continuation";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { GoogleExport } from "@/components/chat/GoogleExport";
import { ValueEstimate } from "@/components/chat/ValueEstimate";
import { useValueEstimates } from "@/components/chat/useValueEstimates";
import { AttachmentPicker, UserMessage } from "@/components/chat/ChatAttachment";
import { encodeAttachmentMessage, type ChatAttachment } from "@/lib/shared/chat-attachment";

type Provider = "openai" | "anthropic" | "google" | "xai" | "openrouter";
type ResponseStyle = "concise" | "medium" | "deep";
type Conversation = { id: string; title: string; provider: Provider; model: string; response_style: ResponseStyle; created_at: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant"; content: string; status?: "streaming" | "completed" | "cancelled" | "failed"; created_at: string };
type ApiResponse<T> = { data?: T; error?: { message?: string } };

const MODELS: Record<Provider, { id: string; label: string }[]> = {
  openai: [{ id: "gpt-4o", label: "GPT-4o" }, { id: "gpt-4o-mini", label: "GPT-4o mini" }, { id: "gpt-4.1", label: "GPT-4.1" }],
  anthropic: [{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }, { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" }],
  google: [{ id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }, { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" }],
  xai: [{ id: "grok-4", label: "Grok 4" }, { id: "grok-3-mini", label: "Grok 3 Mini" }],
  openrouter: [{ id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning · free" }, { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL · free" }, { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra · free" }, { id: "openrouter/free", label: "OpenRouter free router" }],
};

const providerLabel: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google", xai: "xAI", openrouter: "OpenRouter" };

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

export function DashboardChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [assessmentStatuses, setAssessmentStatuses] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [attachmentReading, setAttachmentReading] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("gpt-4o");
  const [style, setStyle] = useState<ResponseStyle>("medium");
  const [useWeb, setUseWeb] = useState(false);
  const [useApify, setUseApify] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [prompt]);

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
    return () => abortRef.current?.abort();
  }, [loadConversations]);

  const openConversation = async (conversation: Conversation) => {
    if (isRunning || attachmentReading) return;
    setAttachment(null);
    setAssessmentStatuses({});
    setError("");
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
    } finally { setIsLoading(false); }
  };

  const newChat = () => {
    if (attachmentReading) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setActiveConversation(null);
    setMessages([]);
    setAssessmentStatuses({});
    setPrompt("");
    setAttachment(null);
    setError("");
    setIsEditingTitle(false);
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
    const response = await fetch(`/api/chat/conversations/${activeConversation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const payload = await readJson<ApiResponse<{ conversation: Conversation }>>(response);
    if (!response.ok || !payload.data?.conversation) { setError(payload.error?.message || "The next-response settings could not be updated."); return; }
    setActiveConversation(payload.data.conversation);
    setConversations((current) => current.map((item) => item.id === payload.data!.conversation.id ? payload.data!.conversation : item));
    setProvider(payload.data.conversation.provider);
    setModel(payload.data.conversation.model);
    setStyle(payload.data.conversation.response_style);
  };

  const changeProvider = (nextProvider: Provider) => {
    void persistRuntime({ provider: nextProvider, model: MODELS[nextProvider][0].id, responseStyle: activeConversation?.response_style || style });
  };

  const appendDelta = (id: string, text: string) => setMessages((current) => current.map((message) => message.id === id ? { ...message, content: message.content + text } : message));

  const send = async () => {
    const content = prompt.trim();
    if (!content || isRunning || attachmentReading) return;
    const messageContent = attachment ? encodeAttachmentMessage(content, attachment) : content;
    if (!messageContent) { setError("The message and attachment exceed the allowed combined size. Shorten the message or file."); return; }
    setError("");
    setPrompt("");
    setIsRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let conversation = activeConversation;
    const userMessage: Message = { id: `local-user-${crypto.randomUUID()}`, role: "user", content: messageContent, status: "completed", created_at: new Date().toISOString() };
    const assistantId = `local-assistant-${crypto.randomUUID()}`;
    try {
      if (!conversation) {
        const created = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model, responseStyle: style, firstMessage: content }), signal: controller.signal });
        const payload = await readJson<ApiResponse<{ conversation: Conversation }>>(created);
        if (!created.ok || !payload.data?.conversation) throw new Error(payload.error?.message || "Conversation could not be created.");
        conversation = payload.data.conversation;
        setActiveConversation(conversation);
        setConversations((current) => [conversation!, ...current]);
      }
      const streamedConversationId = conversation.id;
      setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "", status: "streaming", created_at: new Date().toISOString() }]);
      const response = await fetch(`/api/chat/conversations/${streamedConversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, useWeb, useApify, attachment }), signal: controller.signal });
      if (!response.ok || !response.body) {
        const payload = await readJson<ApiResponse<unknown>>(response);
        setPrompt(content);
        setMessages((current) => current.filter((message) => message.id !== userMessage.id));
        throw new Error(payload.error?.message || "The chat response could not be started.");
      }
      setAttachment(null);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalStatus: Message["status"] = "completed";
      let receivedDone = false;
      let receivedText = false;
      let savedMessageId: string | undefined;
      let streamError: string | undefined;
      const processEvent = (raw: string) => {
        const eventName = raw.match(/^event:\s*(.+)$/m)?.[1];
        const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!data) return;
        const payload = JSON.parse(data) as { text?: string; message?: string; status?: Message["status"]; title?: string; messageId?: string; outcome?: string };
        if (eventName === "delta" && payload.text) { receivedText = true; appendDelta(assistantId, payload.text); }
        if (eventName === "saved") savedMessageId = payload.messageId;
        if (eventName === "assessment" && payload.messageId && payload.outcome) { const id = payload.messageId; const outcome = payload.outcome; setAssessmentStatuses((current) => ({ ...current, [id]: outcome })); }
        if (eventName === "error") streamError = payload.message || "The provider could not complete this request.";
        if (eventName === "title" && payload.title) {
          const title = payload.title;
          setActiveConversation((current) => !current || current.id !== streamedConversationId ? current : { ...current, title });
          setConversations((current) => current.map((item) => item.id === streamedConversationId ? { ...item, title } : item));
        }
        if (eventName === "done") { receivedDone = true; finalStatus = payload.status || "completed"; }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        for (const event of events) processEvent(event);
        if (done) break;
      }
      if (!receivedDone) throw new Error("The response connection ended unexpectedly. Please try again.");
      if (!receivedText) throw new Error(streamError || "The model returned no response. Please try again or choose another model.");
      if (streamError) setError(streamError);
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, id: savedMessageId || message.id, status: finalStatus } : message).filter((message) => message.id !== assistantId || message.content));
      await loadConversations();
      window.dispatchEvent(new Event("operatr:value-updated"));
    } catch (caught) {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "cancelled" as const } : message).filter((message) => message.id !== assistantId || message.content));
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Chat could not be completed.");
    } finally { abortRef.current = null; setIsRunning(false); }
  };

  const saveTitle = async () => {
    if (!activeConversation) return;
    const title = titleDraft.replace(/\s+/g, " ").trim();
    if (!title) return;
    try {
      const response = await fetch(`/api/chat/conversations/${activeConversation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const payload = await readJson<ApiResponse<{ conversation: Conversation }>>(response);
      if (!response.ok || !payload.data?.conversation) throw new Error(payload.error?.message || "The conversation title could not be updated.");
      setActiveConversation(payload.data.conversation);
      setConversations((current) => current.map((conversation) => conversation.id === payload.data!.conversation.id ? payload.data!.conversation : conversation));
      setIsEditingTitle(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The conversation title could not be updated."); }
  };

  const valueRevision = messages.filter((message) => message.role === "assistant" && message.status === "completed" && !message.id.startsWith("local-")).map((message) => message.id).join(",");
  const valueEstimates = useValueEstimates(activeConversation?.id, valueRevision);
  const currentProvider = activeConversation?.provider || provider;
  const currentModel = activeConversation?.model || model;
  const currentStyle = activeConversation?.response_style || style;
  const researchPlaceholder = useApify
    ? "Ask about a company’s website, LinkedIn posts, or Reddit opinions…"
    : "Ask Operatr to think, decide, or create…";

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500">Private chat</p>{isEditingTitle ? <div className="mt-1 flex items-center gap-1"><input autoFocus maxLength={160} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(); if (event.key === "Escape") setIsEditingTitle(false); }} className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm font-semibold outline-none focus:border-zinc-900" /><button type="button" onClick={() => void saveTitle()} className="rounded-lg p-1.5 hover:bg-zinc-200" aria-label="Save title"><Check className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setIsEditingTitle(false)} className="rounded-lg p-1.5 hover:bg-zinc-200" aria-label="Cancel title edit"><X className="h-3.5 w-3.5" /></button></div> : <div className="flex items-center gap-1.5"><p className="truncate text-sm font-semibold text-zinc-900">{activeConversation?.title || "New conversation"}</p>{activeConversation && <button type="button" onClick={() => { setTitleDraft(activeConversation.title); setIsEditingTitle(true); }} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900" aria-label="Edit conversation title"><Pencil className="h-3.5 w-3.5" /></button>}</div>}</div>
      <div className="flex flex-wrap items-center gap-2"><select value={activeConversation?.id || ""} onChange={(event) => { const conversation = conversations.find((item) => item.id === event.target.value); if (conversation) void openConversation(conversation); }} disabled={isRunning || isLoading} className="max-w-48 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-900"><option value="">Recent conversations</option>{conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</select><button type="button" onClick={newChat} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-900 hover:text-zinc-900"><Plus className="h-3.5 w-3.5" />New</button>{activeConversation && <Link href="/agent" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900">Open workspace</Link>}</div>
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</div>}
    <div className="max-h-[380px] min-h-48 space-y-4 overflow-y-auto pr-2">{isLoading ? <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading conversations…</div> : messages.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-7 text-center text-xs text-zinc-500">Start a private conversation. Use Live web for Tavily sources, or turn on Apify research and Operatr will choose a bounded source.</div> : messages.map((message, index) => <div key={message.id} className={`flex min-w-0 gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <span className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-xl bg-zinc-900"><img src="/images/operatr_icon.png" alt="Operatr" className="h-full w-full object-cover scale-[1.06]" /></span>}<div className={`min-w-0 max-w-full sm:max-w-xl rounded-2xl p-3.5 text-xs leading-relaxed ${message.role === "user" ? "bg-zinc-900 font-medium text-white" : "border border-zinc-200 bg-zinc-50 text-zinc-800"}`}>{message.content ? message.role === "assistant" ? <ChatMarkdown content={index >= 2 && messages[index - 1].role === "user" && isContinuationRequest(messages[index - 1].content) && messages[index - 2].role === "assistant" && messages[index - 2].status === "cancelled" ? continuationMarkdown(messages[index - 2].content, message.content) : message.content} /> : <UserMessage content={message.content} /> : <span className="inline-flex items-center gap-2 text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking…</span>}{message.role === "assistant" && message.status === "completed" && !message.id.startsWith("local-") && <GoogleExport key={message.id} messageId={message.id} />}{message.role === "assistant" && message.status === "completed" && !message.id.startsWith("local-") && <ValueEstimate key={`value-${message.id}`} messageId={message.id} estimate={valueEstimates.estimates[message.id]} state={valueEstimates.state} assessmentStatus={assessmentStatuses[message.id]} />}{message.status === "cancelled" && <p className="mt-2 font-mono text-[10px] text-zinc-500">Response stopped</p>}</div></div>)}</div>
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2 focus-within:border-zinc-900">
      <p className="px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-400">Selection applies to the next response</p>
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-1 pb-2">
        <select value={currentProvider} disabled={isRunning} onChange={(event) => changeProvider(event.target.value as Provider)} aria-label="Provider" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none disabled:opacity-60">{(Object.keys(MODELS) as Provider[]).map((option) => <option key={option} value={option}>{providerLabel[option]}</option>)}</select>
        <select value={currentModel} disabled={isRunning} onChange={(event) => void persistRuntime({ provider: currentProvider, model: event.target.value, responseStyle: currentStyle })} aria-label="Model" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none disabled:opacity-60">{MODELS[currentProvider].map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}{!MODELS[currentProvider].some((option) => option.id === currentModel) && <option value={currentModel}>{currentModel}</option>}</select>
        <select value={currentStyle} disabled={isRunning} onChange={(event) => void persistRuntime({ provider: currentProvider, model: currentModel, responseStyle: event.target.value as ResponseStyle })} aria-label="Response effort" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none disabled:opacity-60"><option value="concise">Concise</option><option value="medium">Standard</option><option value="deep">Deep</option></select>
        <button type="button" onClick={() => setUseWeb((enabled) => !enabled)} disabled={isRunning} aria-pressed={useWeb} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold disabled:opacity-60 ${useWeb ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-900"}`}><Globe2 className="h-3 w-3" />{useWeb ? "Live web · on" : "Live web"}</button>
        <button type="button" onClick={() => setUseApify((enabled) => !enabled)} disabled={isRunning} aria-pressed={useApify} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold disabled:opacity-60 ${useApify ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-900"}`}><Globe2 className="h-3 w-3" />{useApify ? "Apify · on" : "Apify research"}</button>
        {isRunning && <button type="button" onClick={() => abortRef.current?.abort()} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900"><Pause className="h-3.5 w-3.5" />Stop</button>}
      </div>
      <div className="px-1 pt-2"><AttachmentPicker attachment={attachment} onChange={setAttachment} onError={setError} onReadingChange={setAttachmentReading} disabled={isRunning} /></div>
      <div className="mt-2 flex items-center gap-2">
        <textarea ref={promptRef} rows={1} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={researchPlaceholder} disabled={isRunning} className="min-h-9 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-400" />
        <button type="button" onClick={() => void send()} disabled={!prompt.trim() || isRunning || attachmentReading} className="rounded-xl bg-zinc-900 p-2.5 text-white enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </div>
    </div>
  </div>;
}
