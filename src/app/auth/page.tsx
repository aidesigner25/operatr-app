"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { resendSignupConfirmation, signIn, signUp } from "@/lib/browser/auth";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signin") setMode("signin");
    if (params.get("confirmed") === "1") {
      setMode("signin");
      setNotice("Email verified. Sign in with the password you just created.");
    }
    if (params.get("error") === "configuration") {
      setError("Authentication is not configured for this environment yet.");
    }
    // Remove the prototype-only client access marker once a real session is in use.
    localStorage.removeItem("operatr_authenticated");
    localStorage.removeItem("operatr_account");
    // Supabase's default implicit confirmation flow can place a temporary token
    // in the URL fragment. Operatr intentionally discards it and starts a normal
    // server-cookie session only after the user signs in.
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const switchMode = (nextMode: "signup" | "signin") => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setConfirmationEmail("");
    setIsPasswordVisible(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password || (mode === "signup" && !name)) {
      setError("Complete the required fields to continue.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    setError("");
    setNotice("");
    setConfirmationEmail("");
    setIsSubmitting(true);
    try {
      if (mode === "signup") {
        const result = await signUp(email.trim(), password, name.trim());
        if (!result.signedIn) {
          setConfirmationEmail(email.trim());
          return;
        }
        router.push("/welcome");
      } else {
        await signIn(email.trim(), password);
        const next = new URLSearchParams(window.location.search).get("next");
        router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not authenticate that account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendConfirmation = async () => {
    if (!confirmationEmail || isResending) return;
    setError("");
    setNotice("");
    setIsResending(true);
    try {
      await resendSignupConfirmation(confirmationEmail);
      setNotice("A fresh confirmation email is on its way.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not resend the confirmation email.");
    } finally {
      setIsResending(false);
    }
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
          <div className="flex rounded-xl bg-[var(--sand)] p-1 mb-8"><button type="button" onClick={() => switchMode("signup")} className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${mode === "signup" ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Create account</button><button type="button" onClick={() => switchMode("signin")} className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${mode === "signin" ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)]"}`}>Sign in</button></div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tan)]">{mode === "signup" ? "Begin your workspace" : "Welcome back"}</p>
          <h2 className="font-display text-4xl tracking-[-0.045em] mt-2">{mode === "signup" ? "Start with clarity." : "Continue your work."}</h2>
          <p className="text-sm leading-relaxed text-[var(--muted-ink)] mt-2">{mode === "signup" ? "Create your operator profile, then decide whether to set up your intelligence stack now or explore first." : "Sign in to return to your private Operatr workspace."}</p>
          {confirmationEmail ? <div className="mt-7 rounded-2xl border border-[#b8caa9] bg-[#f2f7ed] p-5 text-sm text-[#365330]" role="status">
            <div className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Confirm your email to activate Operatr.</p><p className="mt-1 text-xs leading-relaxed">We sent a verification link to <span className="font-semibold">{confirmationEmail}</span>. After confirmation, you’ll return here on the <span className="font-semibold">Sign in</span> tab.</p></div></div>
            {notice && <p className="mt-3 text-xs font-medium">{notice}</p>}
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void resendConfirmation()} disabled={isResending} className="rounded-xl border border-[#8ea780] bg-white px-3.5 py-2 text-xs font-semibold hover:bg-[#fbfdf8] disabled:opacity-60">{isResending ? "Sending…" : "Resend email"}</button><button type="button" onClick={() => switchMode("signin")} className="rounded-xl px-3.5 py-2 text-xs font-semibold text-[#365330] hover:bg-[#e6f0de]">I’ve confirmed — sign in</button></div>
          </div> : <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "signup" && <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><UserRound className="w-3.5 h-3.5 text-[var(--tan)]" /> Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="auth-input" /></label>}
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Mail className="w-3.5 h-3.5 text-[var(--tan)]" /> Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="auth-input" /></label>
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><LockKeyhole className="w-3.5 h-3.5 text-[var(--tan)]" /> Password</span><span className="relative block"><input type={isPasswordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="auth-input pr-11" /><button type="button" onClick={() => setIsPasswordVisible((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--muted-ink)] hover:text-[var(--ink)]" aria-label={isPasswordVisible ? "Hide password" : "Show password"}>{isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
            {error && <p className="text-xs text-[#a14b3f]">{error}</p>}
            {notice && <p className="text-xs text-[#52704b]">{notice}</p>}
            <button type="submit" disabled={isSubmitting} className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 py-3.5 text-xs font-semibold text-[var(--paper)] transition-all hover:-translate-y-0.5 hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-70"><span>{isSubmitting ? "Securing session…" : mode === "signup" ? "Create account" : "Sign in"}</span><ArrowRight className="w-3.5 h-3.5" /></button>
          </form>}
          <p className="mt-5 text-center text-[10px] leading-relaxed text-[var(--muted-ink)]">Operatr uses Supabase Auth with secure, HTTP-only session cookies. Provider keys are managed separately in your encrypted vault.</p>
        </section>
      </div>
    </main>
  );
}
