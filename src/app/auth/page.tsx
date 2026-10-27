"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, Check, LockKeyhole, Mail, UserRound } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password || (mode === "signup" && !name)) {
      setError("Complete the required fields to continue.");
      return;
    }
    localStorage.setItem("operatr_authenticated", "true");
    localStorage.setItem("operatr_account", JSON.stringify({ name: name || "Operator", email }));
    router.push(mode === "signup" ? "/welcome" : "/dashboard");
  };

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] px-5 py-6 sm:p-10 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 hero-wash pointer-events-none" />
      <div className="absolute right-[-12rem] top-[-9rem] h-[34rem] w-[34rem] rounded-full border border-[var(--line)]/70 opacity-70" />
      <div className="relative w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr] rounded-[2rem] border border-[var(--line)] bg-[rgba(255,253,247,0.68)] shadow-[0_30px_90px_-42px_rgba(61,55,45,0.45)] overflow-hidden backdrop-blur-xl">
        <section className="hidden lg:flex flex-col justify-between p-10 bg-[var(--ink)] text-[var(--paper)] relative overflow-hidden">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,253,247,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,253,247,0.08)_1px,transparent_1px)] [background-size:38px_38px]" />
          <Link href="/" className="relative flex items-center gap-3"><span className="w-9 h-9 rounded-xl overflow-hidden bg-[var(--ink)]"><img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" /></span><span className="font-display text-2xl tracking-[-0.04em]">Operatr</span></Link>
          <div className="relative max-w-sm"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--tan-light)]">Private intelligence, on your terms</p><h1 className="font-display text-5xl leading-[0.96] tracking-[-0.05em] mt-4">Build a quieter, sharper operating system.</h1><p className="mt-5 text-sm leading-relaxed text-[var(--tan-light)]">Your research, signals, and strategic work—organized in one private workspace.</p></div>
          <div className="relative flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--tan-light)]"><Check className="w-3.5 h-3.5" /> Bring your own model keys</div>
        </section>

        <section className="p-6 sm:p-10 lg:p-12">
          <Link href="/" className="lg:hidden flex items-center gap-2 mb-10"><span className="w-8 h-8 rounded-xl overflow-hidden bg-[var(--ink)]"><img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" /></span><span className="font-display text-2xl tracking-[-0.04em]">Operatr</span></Link>
          <div className="flex rounded-xl bg-[var(--sand)] p-1 mb-8"><button onClick={() => { setMode("signup"); setError(""); }} className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${mode === "signup" ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Create account</button><button onClick={() => { setMode("signin"); setError(""); }} className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${mode === "signin" ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Sign in</button></div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tan)]">{mode === "signup" ? "Begin your workspace" : "Welcome back"}</p>
          <h2 className="font-display text-4xl tracking-[-0.045em] mt-2">{mode === "signup" ? "Start with clarity." : "Continue your work."}</h2>
          <p className="text-sm leading-relaxed text-[var(--muted-ink)] mt-2">{mode === "signup" ? "Create your operator profile, then decide whether to set up your intelligence stack now or explore first." : "Sign in to return to your private Operatr workspace."}</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "signup" && <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><UserRound className="w-3.5 h-3.5 text-[var(--tan)]" /> Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="auth-input" /></label>}
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Mail className="w-3.5 h-3.5 text-[var(--tan)]" /> Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="auth-input" /></label>
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><LockKeyhole className="w-3.5 h-3.5 text-[var(--tan)]" /> Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="auth-input" /></label>
            {error && <p className="text-xs text-[#a14b3f]">{error}</p>}
            <button type="submit" className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 py-3.5 text-xs font-semibold text-[var(--paper)] transition-all hover:-translate-y-0.5 hover:shadow-soft"><span>{mode === "signup" ? "Create account" : "Sign in"}</span><ArrowRight className="w-3.5 h-3.5" /></button>
          </form>
          <p className="mt-5 text-center text-[10px] leading-relaxed text-[var(--muted-ink)]">Credentials are only used to demonstrate the current prototype access flow. Connect a production identity provider before launch.</p>
        </section>
      </div>
    </main>
  );
}
