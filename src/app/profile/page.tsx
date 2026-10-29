"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { AlertTriangle, Check, ImagePlus, KeyRound, Loader2, Save, Shield, Trash2, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AVATAR_CHOICES, OperatorAvatar } from "@/components/profile/OperatorAvatar";

type Profile = {
  displayName: string;
  email: string;
  organizationName: string;
  avatarChoice: string;
  avatarDataUrl: string | null;
};

const emptyProfile: Profile = { displayName: "", email: "", organizationName: "", avatarChoice: "muse", avatarDataUrl: null };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeSuccess, setWipeSuccess] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { data?: { profile?: Profile }; error?: { message?: string } };
      if (response.ok && payload.data?.profile) setProfile(payload.data.profile);
      else setError(payload.error?.message || "Your profile could not be loaded.");
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved("");
    setError("");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const payload = await response.json().catch(() => ({})) as { data?: { profile?: Profile; emailChangePending?: boolean }; error?: { message?: string } };
    if (!response.ok || !payload.data?.profile) setError(payload.error?.message || "Your profile could not be saved.");
    else {
      setProfile(payload.data.profile);
      setSaved(payload.data.emailChangePending ? "Profile saved. Confirm the email change from your inbox before it takes effect." : "Profile saved.");
      window.dispatchEvent(new CustomEvent("operatr:profile-updated", { detail: payload.data.profile }));
    }
    setSaving(false);
  };

  const chooseUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_500_000) {
      setError("Use a PNG, JPEG, or WebP image smaller than 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...current, avatarDataUrl: typeof reader.result === "string" ? reader.result : null }));
    reader.readAsDataURL(file);
  };

  const handleWipeCredentials = async () => {
    setWiping(true);
    setError("");
    const response = await fetch("/api/vault/credentials", { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as { data?: { deleted?: number }; error?: { message?: string } };
    if (!response.ok) setError(payload.error?.message || "Credentials could not be removed. Please try again.");
    else {
      setWipeSuccess(`${payload.data?.deleted || 0} encrypted credential record${payload.data?.deleted === 1 ? "" : "s"} removed.`);
      setWipeConfirm(false);
    }
    setWiping(false);
  };

  return <DashboardShell>
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--tan)]">Operator identity</p><h1 className="mt-1 font-display text-3xl tracking-[-0.045em] text-[var(--ink)]">Profile & security</h1><p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--muted-ink)]">Control the identity and private vault attached to this workspace.</p></div>
        <button type="button" onClick={() => void save()} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-[var(--paper)] shadow-soft transition-transform hover:-translate-y-0.5 disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save changes"}</button>
      </header>

      {(error || saved) && <div className={`rounded-2xl border px-4 py-3 text-xs ${error ? "border-red-200 bg-red-50 text-red-800" : "border-[#bdcbb4] bg-[#edf3e8] text-[#46613b]"}`}>{error || <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" />{saved}</span>}</div>}

      <div className="grid gap-6 lg:grid-cols-[0.86fr_1.4fr]">
        <section className="rounded-[1.6rem] border border-[var(--line)] bg-[var(--paper)] p-5 shadow-soft sm:p-6">
          <div className="flex items-center gap-2 border-b border-[var(--line)] pb-4"><UserRound className="h-4 w-4" /><h2 className="text-sm font-bold">Operator portrait</h2></div>
          <div className="mt-6 flex flex-col items-center text-center"><div className="relative"><OperatorAvatar choice={profile.avatarChoice} imageUrl={profile.avatarDataUrl} alt="Selected operator avatar" className="h-28 w-28 rounded-[2rem] shadow-soft" /><span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--paper)] bg-[#748260] text-[var(--paper)]"><Check className="h-3.5 w-3.5" /></span></div><p className="mt-4 text-sm font-semibold">{profile.displayName || "Active Operator"}</p><p className="mt-1 text-[11px] text-[var(--muted-ink)]">Choose a studio avatar or add your own image.</p></div>
          <div className="mt-5 grid grid-cols-3 gap-2">{AVATAR_CHOICES.map((avatar) => <button key={avatar.id} type="button" title={avatar.label} onClick={() => setProfile((current) => ({ ...current, avatarChoice: avatar.id, avatarDataUrl: null }))} className={`rounded-2xl p-1.5 transition-all ${profile.avatarChoice === avatar.id && !profile.avatarDataUrl ? "bg-[var(--ink)] shadow-soft" : "bg-[var(--sand)] hover:bg-[var(--tan-wash)]"}`}><OperatorAvatar choice={avatar.id} alt={avatar.label} className="h-12 w-12 rounded-xl" /></button>)}</div>
          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--tan)] px-3 py-2.5 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--tan-wash)]"><ImagePlus className="h-3.5 w-3.5" />Upload custom image<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void chooseUpload(event)} /></label>
          {profile.avatarDataUrl && <button type="button" onClick={() => setProfile((current) => ({ ...current, avatarDataUrl: null }))} className="mt-3 w-full text-[11px] font-medium text-[var(--muted-ink)] underline underline-offset-4">Use a studio avatar instead</button>}
        </section>

        <section className="rounded-[1.6rem] border border-[var(--line)] bg-[var(--paper)] p-5 shadow-soft sm:p-6">
          <div className="flex items-center gap-2 border-b border-[var(--line)] pb-4"><Shield className="h-4 w-4" /><h2 className="text-sm font-bold">Account identity</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Display name<input value={profile.displayName} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} maxLength={80} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2.5 text-xs font-normal outline-none focus:border-[var(--tan)]" /></label><label className="text-xs font-semibold">Email address<input type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2.5 text-xs font-normal outline-none focus:border-[var(--tan)]" /></label><label className="text-xs font-semibold sm:col-span-2">Organization / workspace<input value={profile.organizationName} onChange={(event) => setProfile((current) => ({ ...current, organizationName: event.target.value }))} maxLength={160} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2.5 text-xs font-normal outline-none focus:border-[var(--tan)]" /></label></div>
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--muted-ink)]">Changing your email may require confirmation from your inbox, depending on the authentication policy.</p>
        </section>
      </div>

      <section className="rounded-[1.6rem] border border-red-200 bg-[#fff8f6] p-5 shadow-soft sm:p-6">
        <div className="flex items-center gap-2 border-b border-red-100 pb-4 text-red-900"><AlertTriangle className="h-4 w-4" /><h2 className="text-sm font-bold">Credential vault</h2></div>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-red-900">Purge all stored keys</p><p className="mt-1 max-w-2xl text-xs leading-relaxed text-red-800">Deletes every encrypted API credential from your private vault. Existing conversations remain, but providers must be reconnected before they can run again.</p></div><button type="button" onClick={() => setWipeConfirm(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Purge stored keys</button></div>
        {wipeSuccess && <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#edf3e8] px-3 py-2 text-xs font-semibold text-[#46613b]"><Check className="h-3.5 w-3.5" />{wipeSuccess}</p>}
      </section>

      {wipeConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><div role="dialog" aria-modal="true" aria-labelledby="purge-title" className="w-full max-w-md rounded-[1.6rem] border border-red-200 bg-[var(--paper)] p-6 shadow-2xl"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-700"><KeyRound className="h-5 w-5" /></div><h2 id="purge-title" className="mt-4 font-display text-2xl tracking-[-0.04em]">Purge every key?</h2><p className="mt-2 text-sm leading-relaxed text-[var(--muted-ink)]">This permanently deletes every encrypted provider key from your vault. You will need to add each one again before Operatr can use it.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setWipeConfirm(false)} disabled={wiping} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-[var(--muted-ink)] hover:bg-[var(--sand)]">Keep keys</button><button type="button" onClick={() => void handleWipeCredentials()} disabled={wiping} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60">{wiping && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{wiping ? "Purging…" : "Yes, purge keys"}</button></div></div></div>}
    </div>
  </DashboardShell>;
}
