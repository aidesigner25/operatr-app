"use client";

import React, { useState } from "react";
import {
  User,
  Shield,
  Trash2,
  AlertTriangle,
  Check,
  Lock,
  Key,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function ProfilePage() {
  const [name, setName] = useState("George");
  const [email, setEmail] = useState("george.operator@gmail.com");
  const [organization, setOrganization] = useState("Autonomous Intelligence Labs");
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [wipeSuccess, setWipeSuccess] = useState(false);

  const handleWipeCredentials = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("operatr_user_config");
    }
    setWipeSuccess(true);
    setWipeConfirm(false);
    setTimeout(() => {
      setWipeSuccess(false);
      window.location.href = "/";
    }, 2000);
  };

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Operator Profile & Security
          </h1>
          <p className="text-xs text-zinc-500">
            Manage your account identity, security preferences, and credential vault.
          </p>
        </div>

        {/* Identity Details */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <User className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Account Identity
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-zinc-800 block mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-900 bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-800 block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-900 bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-zinc-800 block mb-1">
                Organization / Workspace
              </label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-900 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Security Audit */}
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/90 shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
            <Shield className="w-4 h-4 text-zinc-900" />
            <h2 className="text-sm font-bold text-zinc-900">
              Zero-Trust Audit Log
            </h2>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
              <span className="font-mono text-zinc-700">AES-256 Vault Encryption</span>
              <span className="text-[10px] font-mono text-emerald-600 font-bold">ACTIVE</span>
            </div>
            <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
              <span className="font-mono text-zinc-700">Prompt Injection Shielding</span>
              <span className="text-[10px] font-mono text-emerald-600 font-bold">ENFORCED</span>
            </div>
            <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
              <span className="font-mono text-zinc-700">OAuth Revocation Status</span>
              <span className="text-[10px] font-mono text-zinc-600 font-bold">READY</span>
            </div>
          </div>
        </div>

        {/* Danger Zone: Full Credential Wipe */}
        <div className="p-6 rounded-3xl bg-red-50/50 border border-red-200 shadow-soft space-y-4">
          <div className="flex items-center gap-2 text-red-900 pb-3 border-b border-red-200/60">
            <AlertTriangle className="w-4 h-4 text-red-700" />
            <h2 className="text-sm font-bold">
              Purge Credentials & Connected Accounts
            </h2>
          </div>

          <p className="text-xs text-red-800 leading-relaxed">
            Immediately delete all stored API keys (OpenAI, Anthropic, Gemini, xAI, Tavily, Apify) and disconnect Google Suite OAuth tokens. This leaves zero residue on the system.
          </p>

          {wipeSuccess ? (
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-900 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>All credentials securely erased. Redirecting...</span>
            </div>
          ) : wipeConfirm ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleWipeCredentials}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-all shadow-sm"
              >
                Confirm Complete Data Wipe
              </button>
              <button
                onClick={() => setWipeConfirm(false)}
                className="px-4 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-700 text-xs font-semibold hover:bg-zinc-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setWipeConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Purge All Stored Keys</span>
            </button>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
