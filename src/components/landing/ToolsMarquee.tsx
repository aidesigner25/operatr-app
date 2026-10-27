"use client";

import React from "react";

interface ToolLogo {
  name: string;
  src: string;
  alt: string;
  /**
   * Rendered box in px.
   *
   * Sizes are tuned against each asset's *visible ink* rather than its canvas,
   * because the square sources (xAI, X, Google) ship with transparent padding —
   * a uniform CSS height alone renders their glyphs noticeably smaller than the
   * full-bleed wordmarks (Anthropic, OpenAI, Gemini, Tavily).
   */
  width: number;
  height: number;
}

/* Boxes are normalized around a 32px optical band; no logo can affect rail height. */

const LOGOS: ToolLogo[] = [
  { name: "OpenAI", src: "/images/OpenAI.png", alt: "OpenAI logo", width: 126, height: 32 },
  { name: "Anthropic", src: "/images/Anthropic.png", alt: "Anthropic logo", width: 190, height: 32 },
  { name: "Gemini", src: "/images/Gemini.png", alt: "Gemini logo", width: 132, height: 32 },
  { name: "xAI", src: "/images/xAI.png", alt: "xAI logo", width: 38, height: 38 },
  { name: "Tavily", src: "/images/Tavily.png", alt: "Tavily logo", width: 110, height: 32 },
  { name: "X", src: "/images/X.png", alt: "X logo", width: 38, height: 38 },
  { name: "Google", src: "/images/Google.png", alt: "Google logo", width: 38, height: 38 },
];

export function ToolsMarquee() {
  // Duplicate exactly 2x for a seamless -50% translate loop
  const duplicatedLogos = [...LOGOS, ...LOGOS];

  return (
    <div className="w-full py-9 border-y border-[var(--line)] bg-[rgba(255,253,247,0.6)] backdrop-blur-sm overflow-hidden select-none">
      <div className="max-w-7xl mx-auto px-6 mb-7 flex items-center justify-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--muted-ink)] font-medium">
          Integrated Tool Architecture
        </p>
      </div>

      <div className="relative w-full overflow-hidden">
        {/* Left and right fade gradients */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[var(--canvas)] via-[var(--canvas)]/80 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[var(--canvas)] via-[var(--canvas)]/80 to-transparent z-10 pointer-events-none" />

        <div className="animate-marquee items-center">
          {duplicatedLogos.map((logo, idx) => (
            <div
              key={`${logo.name}-${idx}`}
              className="flex h-11 items-center justify-center shrink-0 mx-8 sm:mx-10 opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
              title={logo.name}
            >
              <img
                src={logo.src}
                alt={logo.alt}
                style={{ height: logo.height, width: logo.width }}
                className="block max-h-full object-contain"
                loading="eager"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
