"use client";

import React from "react";

/**
 * Classical "Creation of Adam" reaching hands rendered in a restrained
 * stippled / halftone dot matrix aesthetic, directly referencing Formless AI.
 */
export function CreationOfAdamHands() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none opacity-40">
      <svg
        className="w-full h-full object-cover"
        viewBox="0 0 1440 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="handsFade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="halftoneDotsDense"
            x="0"
            y="0"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="6" cy="6" r="1.8" fill="#18181B" opacity="0.65" />
          </pattern>
          <pattern
            id="halftoneDotsSparse"
            x="0"
            y="0"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="8" cy="8" r="1.2" fill="#71717A" opacity="0.45" />
          </pattern>
        </defs>

        {/* Left Reaching Hand (The Divine Hand, Reaching Right) */}
        <g opacity="0.85" className="transition-transform duration-700 hover:translate-x-2">
          {/* Base Hand Silhouette Halftone Fill */}
          <path
            d="M-50,320 Q60,340 180,330 Q280,310 380,370 Q430,395 480,410 Q540,430 580,425 Q570,445 520,460 Q450,470 380,490 Q290,520 180,550 Q60,570 -50,560 Z"
            fill="url(#halftoneDotsDense)"
          />
          {/* Extended Index Finger reaching toward center */}
          <path
            d="M380,370 Q470,390 560,405 Q600,412 630,418 Q620,428 580,432 Q510,435 430,420 Z"
            fill="url(#halftoneDotsDense)"
          />
          {/* Second & Third fingers curved */}
          <path
            d="M360,410 Q440,430 510,460 Q490,480 430,475 Q370,460 340,440 Z"
            fill="url(#halftoneDotsSparse)"
          />
          {/* Subtle Stippled Outlines */}
          <path
            d="M-40,330 C120,350 260,330 380,380 C480,410 560,415 625,418"
            stroke="#18181B"
            strokeWidth="1.5"
            strokeDasharray="2 6"
            opacity="0.6"
          />
          <path
            d="M-40,550 C140,560 270,510 370,485 C460,470 540,445 590,430"
            stroke="#18181B"
            strokeWidth="1.5"
            strokeDasharray="2 6"
            opacity="0.4"
          />
        </g>

        {/* Right Reaching Hand (The Human Hand, Reaching Left) */}
        <g opacity="0.85" className="transition-transform duration-700 hover:-translate-x-2">
          {/* Base Hand Silhouette Halftone Fill */}
          <path
            d="M1490,340 Q1360,350 1240,360 Q1120,380 1020,410 Q940,430 870,435 Q860,420 900,405 Q980,380 1080,350 Q1200,320 1340,310 Q1420,300 1490,300 Z"
            fill="url(#halftoneDotsDense)"
          />
          {/* Extended Index Finger pointing toward divine finger */}
          <path
            d="M1020,410 Q940,430 850,432 Q815,430 790,426 Q800,418 840,412 Q910,400 990,385 Z"
            fill="url(#halftoneDotsDense)"
          />
          {/* Thumb angled upward */}
          <path
            d="M1060,355 Q1010,335 960,330 Q940,345 980,365 Q1020,380 1070,390 Z"
            fill="url(#halftoneDotsSparse)"
          />
          {/* Lower palm and bent fingers */}
          <path
            d="M1120,440 Q1040,470 960,480 Q930,465 970,450 Q1050,430 1140,420 Z"
            fill="url(#halftoneDotsSparse)"
          />
          {/* Subtle Stippled Outlines */}
          <path
            d="M1480,310 C1320,320 1180,350 1040,390 C940,415 850,425 795,426"
            stroke="#18181B"
            strokeWidth="1.5"
            strokeDasharray="2 6"
            opacity="0.6"
          />
          <path
            d="M1480,490 C1340,510 1200,480 1080,450 C990,440 920,435 860,432"
            stroke="#18181B"
            strokeWidth="1.5"
            strokeDasharray="2 6"
            opacity="0.4"
          />
        </g>

        {/* Central Gap Sparkle / Contact Point (The Divine Spark at (710, 422)) */}
        <circle cx="712" cy="422" r="3" fill="#18181B" opacity="0.8" />
        <circle cx="712" cy="422" r="8" stroke="#18181B" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
        <line x1="712" y1="412" x2="712" y2="432" stroke="#18181B" strokeWidth="0.8" opacity="0.5" />
        <line x1="702" y1="422" x2="722" y2="422" stroke="#18181B" strokeWidth="0.8" opacity="0.5" />
      </svg>
    </div>
  );
}
