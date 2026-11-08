"use client";

import React from "react";

interface ExitoLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  className?: string;
  tagline?: string;
}

export function ExitoLogoIcon({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 drop-shadow-[0_0_15px_rgba(124,58,237,0.4)] ${className}`}
    >
      <defs>
        <radialGradient id="logoBg" cx="50%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#2a1650" />
          <stop offset="50%" stop-color="#0f0724" />
          <stop offset="100%" stop-color="#05020a" />
        </radialGradient>
        <linearGradient id="logoWave" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#7c3aed" />
          <stop offset="45%" stop-color="#a855f7" />
          <stop offset="75%" stop-color="#06b6d4" />
          <stop offset="100%" stop-color="#38bdf8" />
        </linearGradient>
        <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fef08a" />
          <stop offset="50%" stop-color="#fbbf24" />
          <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
        <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer rounded tile */}
      <rect width="512" height="512" rx="128" fill="url(#logoBg)" />
      <rect width="508" height="508" x="2" y="2" rx="126" stroke="url(#logoWave)" stroke-width="4" stroke-opacity="0.3" />

      {/* Ripple Rings */}
      <circle cx="256" cy="256" r="190" stroke="#7c3aed" stroke-width="2.5" stroke-opacity="0.2" stroke-dasharray="8 12" />
      <circle cx="256" cy="256" r="150" stroke="#06b6d4" stroke-width="2.5" stroke-opacity="0.3" stroke-dasharray="6 8" />

      {/* Mind Waves & Equalizer */}
      <g filter="url(#logoGlow)">
        <rect x="136" y="210" width="22" height="92" rx="11" fill="url(#logoWave)" />
        <rect x="176" y="165" width="22" height="182" rx="11" fill="url(#logoWave)" />
        <rect x="216" y="115" width="22" height="282" rx="11" fill="url(#logoWave)" />
        <rect x="256" y="80" width="24" height="352" rx="12" fill="url(#logoWave)" />
        <rect x="298" y="145" width="22" height="222" rx="11" fill="url(#logoWave)" />
        <rect x="338" y="195" width="22" height="122" rx="11" fill="url(#logoWave)" />

        <path
          d="M 120 280 C 180 380, 320 380, 380 280 C 330 220, 170 220, 120 280 Z"
          stroke="url(#logoWave)"
          stroke-width="8"
          stroke-linecap="round"
          opacity="0.6"
        />
      </g>

      {/* Star of Success */}
      <g transform="translate(268, 62)">
        <path d="M 0 -26 Q 2 -6 20 0 Q 2 6 0 26 Q -2 6 -20 0 Q -2 -6 0 -26 Z" fill="url(#starGrad)" />
        <circle cx="0" cy="0" r="4.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

export default function ExitoLogo({
  size = "md",
  showTagline = true,
  className = "",
  tagline = "Sintoniza tu mente. Crea tu realidad.",
}: ExitoLogoProps) {
  const iconSizes = {
    sm: 28,
    md: 38,
    lg: 48,
    xl: 60,
  };

  const titleSizes = {
    sm: "text-sm",
    md: "text-base md:text-lg",
    lg: "text-xl md:text-2xl",
    xl: "text-3xl md:text-4xl",
  };

  const cyouSizes = {
    sm: "text-[9px] px-1.5 py-0.5",
    md: "text-[10px] px-2 py-0.5",
    lg: "text-xs px-2.5 py-0.5",
    xl: "text-sm px-3 py-1",
  };

  const taglineSizes = {
    sm: "text-[9px]",
    md: "text-[10px]",
    lg: "text-xs",
    xl: "text-sm",
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <ExitoLogoIcon size={iconSizes[size]} />
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={`font-black tracking-tight bg-gradient-to-r from-white via-[#e9d5ff] to-[#06b6d4] bg-clip-text text-transparent uppercase ${titleSizes[size]}`}>
            Éxito
          </span>
          <span className={`rounded-full bg-cyan-500/10 border border-cyan-400/40 text-cyan-300 font-mono font-black uppercase tracking-wider shadow-[0_0_12px_rgba(6,182,212,0.3)] ${cyouSizes[size]}`}>
            .cyou
          </span>
        </div>
        {showTagline && (
          <p className={`text-white/40 font-medium tracking-wide mt-1 ${taglineSizes[size]}`}>
            {tagline}
          </p>
        )}
      </div>
    </div>
  );
}
