"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, FileText, Globe, Key, Lock, Save, ShieldCheck, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

const PROVIDERS = [
  { id: "openai", name: "OpenAI API Key", detail: "GPT-4o, o1", placeholder: "sk-proj-...", group: "llm" },
  { id: "anthropic", name: "Anthropic API Key", detail: "Claude", placeholder: "sk-ant-...", group: "llm" },
  { id: "google", name: "Google Gemini API Key", detail: "Gemini", placeholder: "AIza...", group: "llm" },
  { id: "xai", name: "xAI / Grok API Key", detail: "Grok", placeholder: "xai-...", group: "llm" },
  { id: "tavily", name: "Tavily Search API Key", detail: "Research", placeholder: "tvly-...", group: "tools" },
  { id: "apify", name: "Apify API Token", detail: "Extraction", placeholder: "apify_api_...", group: "tools" },
] as const;

type Provider = (typeof PROVIDERS)[number]["id"];
type VaultCredential = { provider: Provider; lastFour: string; updatedAt: string };
type VaultResponse = { data?: { credentials?: VaultCredential[] }; error?: { message?: string } };

const emptyCredentials = () => Object.fromEntries(PROVIDERS.map(({ id }) => [id, ""])) as Record<Provider, string>;

export default function IntegrationsPage() {
  const [values, setValues] = useState<Record<Provider, string>>(emptyCredentials);
  const [connected, setConnected] = useState<Record<string, VaultCredential>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/vault/credentials", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as VaultResponse;
      if (!response.ok) throw new Error(payload.error?.message || "Vault status could not be loaded.");
      setConnected(Object.fromEntries((payload.data?.credentials || []).map((credential) => [credential.provider, credential])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vault status could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const saveCredentials = async () => {
    const entries = PROVIDERS.filter(({ id }) => values[id].trim()).map(({ id }) => [id, values[id].trim()] as const);
    if (entries.length === 0) {
      setError("Enter at least one API key to save a connection.");
      return;
    }

    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      await Promise.all(entries.map(async ([provider, credential]) => {
        const response = await fetch(`/api/vault/credentials/${provider}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const payload = await response.json().catch(() => ({})) as VaultResponse;
        if (!response.ok) throw new Error(payload.error?.message || `Could not save ${provider}.`);
      }));
      setValues(emptyCredentials());
      setMessage(`${entries.length} secure connection${entries.length === 1 ? "" : "s"} saved. Live provider calls remain disabled.`);
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A credential could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const disconnect = async (provider: Provider) => {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/vault/credentials/${provider}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({})) as VaultResponse;
      if (!response.ok) throw new Error(payload.error?.message || "Credential could not be removed.");
      await loadStatus();
      setMessage(`${PROVIDERS.find((item) => item.id === provider)?.name.replace(" API Key", "").replace(" API Token", "")} disconnected.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Credential could not be removed.");
    }
  };

  const renderProvider = (provider: (typeof PROVIDERS)[number]) => {
    const status = connected[provider.id];
    return <div key={provider.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-zinc-900">{provider.name}</span>
        {status ? <span className="text-[10px] font-mono text-emerald-700">Connected · ••••{status.lastFour}</span> : <span className="text-[10px] font-mono text-zinc-400">{provider.detail}</span>}
      </div>
      <div className="flex gap-2">
        <input type="password" autoComplete="off" spellCheck={false} placeholder={status ? "Enter a replacement key" : provider.placeholder} value={values[provider.id]} onChange={(event) => setValues((current) => ({ ...current, [provider.id]: event.target.value }))} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white focus:outline-none focus:border-zinc-900" />
        {status && <button type="button" onClick={() => void disconnect(provider.id)} aria-label={`Disconnect ${provider.name}`} className="rounded-xl border border-zinc-200 bg-white px-2.5 text-zinc-500 hover:border-red-200 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </div>;
  };

  return <DashboardShell>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-xl font-bold tracking-tight text-zinc-900">Integrations & BYOK Vault</h1><p className="text-xs text-zinc-500">Store provider credentials in your encrypted, private vault. Connections do not enable live calls.</p></div>
        <button type="button" onClick={() => void saveCredentials()} disabled={isSaving || isLoading} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60">
          {isSaving ? <><Lock className="w-3.5 h-3.5" /><span>Encrypting…</span></> : <><Save className="w-3.5 h-3.5" /><span>Save connections</span></>}
        </button>
      </div>
      <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-soft flex items-start gap-3"><ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /><div className="text-xs space-y-1"><span className="font-bold text-zinc-900 block">Server-side encrypted vault</span><p className="text-zinc-500 leading-relaxed">Keys are sent only to an authenticated Operatr server route, encrypted with AES-256-GCM, and stored per user under database row-level security. Their plaintext is never displayed again.</p></div></div>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{error}</p>}
      {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">{message}</p>}
      <section className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-6"><div className="flex items-center gap-2.5 pb-4 border-b border-zinc-100"><Bot className="w-4 h-4 text-zinc-900" /><h2 className="text-sm font-bold text-zinc-900">Core LLM Providers</h2></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{PROVIDERS.filter((provider) => provider.group === "llm").map(renderProvider)}</div></section>
      <section className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-6"><div className="flex items-center gap-2.5 pb-4 border-b border-zinc-100"><Globe className="w-4 h-4 text-zinc-900" /><h2 className="text-sm font-bold text-zinc-900">Research & Extraction Tools</h2></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{PROVIDERS.filter((provider) => provider.group === "tools").map(renderProvider)}</div></section>
      <section className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-5"><div className="flex items-center gap-2.5 pb-4 border-b border-zinc-100"><FileText className="w-4 h-4 text-zinc-900" /><h2 className="text-sm font-bold text-zinc-900">Google Workspace</h2></div><div className="flex items-start gap-3 rounded-2xl bg-zinc-50 border border-zinc-200/70 p-4"><Key className="w-4 h-4 text-zinc-500 mt-0.5" /><p className="text-xs leading-relaxed text-zinc-500">OAuth connections remain intentionally unavailable until the later Google integration phase. They are not represented by API-key vault records.</p></div></section>
      {isLoading && <p className="text-center text-[10px] font-mono uppercase tracking-wider text-zinc-400">Loading vault status…</p>}
    </div>
  </DashboardShell>;
}
