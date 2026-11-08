"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

interface UserInfo {
  username: string;
  email: string;
  role: string;
  tokens_balance: number;
}

interface UnifiedHeaderProps {
  onToggleSidebar?: () => void;
}

export default function UnifiedHeader({ onToggleSidebar }: UnifiedHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ecommerce/me/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setUser(data.user);
          if (data.user.role === "super_admin" || data.user.role === "tools_admin") {
            sessionStorage.setItem("mediasuite_role", data.user.role);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      sessionStorage.removeItem("mediasuite_role");
      router.push("/login");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  // Human readable title from path
  const getPageTitle = () => {
    if (!pathname) return "Dashboard";
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 0) return "Dashboard";
    const segment = parts[0];
    if (pathname === "/studio/youtube") return "YouTube Studio 360° & Analíticas";
    const mapping: Record<string, string> = {
      dashboard: "Dashboard Principal",
      studio: "Studio Music",
      playlist: "Music Playlist",
      audiobooks: "Audiobooks & Resúmenes",
      shorts: "Videomaker Shorts",
      media: "Media Explorer",
      tasks: "Process Monitor",
      pexels: "Pexels B-Roll",
      animation: "Animation Studio",
      projects: "Mis Proyectos",
    };
    return mapping[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
  };

  return (
    <header className="flex items-center justify-between px-6 h-16 border-b border-white/[0.04] bg-[#0d0d1f]/40 backdrop-blur-xl shrink-0 z-50">
      {/* Left side: Hamburger (mobile) / Title (desktop) */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/10 transition-colors"
          aria-label="Abrir menú de navegación"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <h2 className="hidden lg:block text-sm font-bold text-white tracking-tight">
          {getPageTitle()}
        </h2>
        <div className="lg:hidden flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#06b6d4] flex items-center justify-center text-white font-black text-xs">
            M
          </div>
          <span className="text-sm font-black text-white">MediaSuite</span>
        </div>
      </div>

      {/* Right side: Engine Status & User Profile Dropdown */}
      <div className="flex items-center gap-4">

        {/* Status indicator (Desktop only) */}
        {user && user.role !== "client" && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.04] text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            ENGINE READY
          </div>
        )}


        {/* User Dropdown */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 p-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] hover:bg-white/10 hover:border-white/10 transition-all focus:outline-none"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#06b6d4] flex items-center justify-center text-white font-bold text-sm shadow-md">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-white/80 pr-2">
                {user.username}
              </span>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#0d0d1f]/95 border border-white/[0.08] shadow-2xl backdrop-blur-2xl py-2 z-50 animate-fade-in text-left">
                {/* User Info Header */}
                <div className="px-4 py-2 border-b border-white/[0.04] mb-1">
                  <p className="text-xs font-bold text-white truncate">{user.username}</p>
                  <p className="text-[10px] text-white/40 truncate">{user.email}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#a78bfa] bg-[#7c3aed]/10 px-1.5 py-0.5 rounded">
                      {user.role === "super_admin" ? "Admin" : user.role === "tools_admin" ? "Producer" : "Client"}
                    </span>
                    <span className="text-[9px] font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                        <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">T</text>
                      </svg>
                      {user.tokens_balance} Tokens
                    </span>
                  </div>
                </div>

                {/* Edit Profile Option */}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    router.push("/portal?edit=1"); // Redirect to profile page with query param to open modal
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>Editar Perfil</span>
                </button>

                {/* Logout Option */}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    handleLogout();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors border-t border-white/[0.04] mt-1 flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
