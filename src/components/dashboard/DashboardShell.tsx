"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Layers,
  Settings,
  Code2,
  User,
  LogOut,
  Bell,
  Sparkles,
  Shield,
  DollarSign,
  Menu,
  X,
} from "lucide-react";

interface DashboardShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Agent workspace", href: "/agent", icon: Bot },
  { name: "Integrations", href: "/integrations", icon: Layers },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "API & Webhooks", href: "/api", icon: Code2 },
  { name: "Profile", href: "/profile", icon: User },
];

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hourlyRate, setHourlyRate] = useState("150");
  const [userConfig, setUserConfig] = useState<any>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (localStorage.getItem("operatr_authenticated") !== "true") {
        router.replace("/auth?mode=signin");
        return;
      }
      const stored = localStorage.getItem("operatr_user_config");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setUserConfig(parsed);
          if (parsed.hourlyRate) setHourlyRate(String(parsed.hourlyRate));
        } catch (e) {
          // ignore
        }
      }
      setIsCheckingAccess(false);
    }
  }, [router]);

  if (isCheckingAccess) {
    return <div className="min-h-screen bg-[var(--canvas)]" />;
  }

  return (
    <div className="operatr-app-shell min-h-screen bg-[var(--canvas)] text-[var(--ink)] flex font-sans">
      {/* LEFT SIDEBAR (Desktop) - Directly matching Jobgio reference */}
      <aside className="hidden lg:flex w-64 bg-[var(--paper)] border-r border-[var(--line)] p-6 flex-col justify-between shrink-0 sticky top-0 h-screen">
        <div className="space-y-8">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-2xl overflow-hidden shadow-sm">
              <img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" />
            </div>
            <div>
              <span className="font-display text-2xl tracking-[-0.04em] text-[var(--ink)] block leading-tight">
                Operatr
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--tan)]">
                Agentic OS
              </span>
            </div>
          </Link>

          {/* Navigation Pill List */}
          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-[var(--ink)] text-[var(--paper)] shadow-soft"
                      : "text-[var(--muted-ink)] hover:text-[var(--ink)] hover:bg-[var(--sand)]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[var(--paper)]" : "text-[var(--muted-ink)]"}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card at Bottom of Sidebar */}
        <div className="pt-6 border-t border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center font-bold text-xs">
                {userConfig?.primaryProvider ? userConfig.primaryProvider[0].toUpperCase() : <img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover rounded-full scale-[1.06]" />}
              </div>
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#748260] text-[9px] font-bold text-[var(--paper)] flex items-center justify-center border-2 border-[var(--paper)]">
                ✓
              </span>
            </div>
            <div>
              <div className="text-xs font-bold text-[var(--ink)] tracking-tight">
                Active Operator
              </div>
              <div className="text-[10px] font-mono text-[var(--muted-ink)]">
                ${hourlyRate}/hr rate
              </div>
            </div>
          </div>

          <Link
            href="/"
            title="Exit to Landing"
            onClick={() => localStorage.removeItem("operatr_authenticated")}
            className="p-2 text-[var(--muted-ink)] hover:text-[var(--ink)] rounded-full hover:bg-[var(--sand)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden bg-[var(--paper)] border-b border-[var(--line)] px-5 py-4 flex items-center justify-between sticky top-0 z-40">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden">
              <img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" />
            </div>
            <span className="font-display text-2xl tracking-[-0.04em] text-[var(--ink)]">
              Operatr
            </span>
          </Link>

          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="p-2 text-[var(--muted-ink)] hover:text-[var(--ink)]"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Mobile Dropdown Nav */}
        {mobileNavOpen && (
          <div className="lg:hidden bg-[var(--paper)] border-b border-[var(--line)] p-4 space-y-1 z-30">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${
                    isActive ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted-ink)]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Dynamic Page Content */}
        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex flex-col gap-6">
          {children}
        </main>
      </div>
    </div>
  );
}
