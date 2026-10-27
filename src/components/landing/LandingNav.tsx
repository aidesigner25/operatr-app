"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";

export function LandingNav({ onOpenAuth }: { onOpenAuth: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 py-4 sm:py-6 transition-all duration-300">
      <nav
        className={`w-full max-w-5xl rounded-full px-5 sm:px-7 py-3 flex items-center justify-between transition-all duration-300 ${
          scrolled
            ? "bg-[rgba(255,253,247,0.86)] backdrop-blur-md border border-[var(--line)] shadow-soft"
            : "bg-[rgba(255,253,247,0.58)] backdrop-blur-sm border border-[rgba(220,212,199,0.8)]"
        }`}
      >
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-full overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
            <img src="/images/operatr_icon.png" alt="Operatr" className="w-full h-full object-cover scale-[1.06]" />
          </div>
          <span className="font-display text-xl tracking-[-0.04em] text-[var(--ink)]">
            Operatr
          </span>
        </Link>

        {/* Center Links (Desktop) */}
        <div className="hidden md:flex items-center gap-7">
          <a
            href="#vision"
            className="text-xs font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors"
          >
            Vision
          </a>
          <a
            href="#engine"
            className="text-xs font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors"
          >
            Capabilities
          </a>
          <a
            href="#simulation"
            className="text-xs font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors"
          >
            Live Simulation
          </a>
          <a
            href="#calculator"
            className="text-xs font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors"
          >
            ROI Telemetry
          </a>
          <a
            href="#byok"
            className="text-xs font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors"
          >
            BYOK Privacy
          </a>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-semibold hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98] transition-all"
          >
            <span>Start for free</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-[var(--muted-ink)] hover:text-[var(--ink)]"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-20 left-4 right-4 rounded-3xl bg-[var(--paper)] border border-[var(--line)] shadow-soft-lg p-6 space-y-4">
          <a
            href="#vision"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] py-1"
          >
            Vision
          </a>
          <a
            href="#engine"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] py-1"
          >
            Capabilities
          </a>
          <a
            href="#simulation"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] py-1"
          >
            Live Simulation
          </a>
          <a
            href="#calculator"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] py-1"
          >
            ROI Telemetry
          </a>
          <a
            href="#byok"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-[var(--muted-ink)] hover:text-[var(--ink)] py-1"
          >
            BYOK Privacy
          </a>
          <div className="pt-4 border-t border-[var(--line)] flex flex-col gap-2">
            <Link
              href="/dashboard"
              className="text-center py-2.5 rounded-xl text-xs font-semibold text-[var(--ink)] bg-[var(--sand)]"
            >
              Go to Dashboard
            </Link>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAuth();
              }}
              className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[var(--ink)] text-[var(--paper)]"
            >
              Start for free
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
