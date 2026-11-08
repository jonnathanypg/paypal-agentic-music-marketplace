"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

// ─── SVG Icons ───
const IconDashboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);

const IconProjects = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconMedia = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconShop = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const IconTasks = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconStudio = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const IconPlaylist = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconBooks = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5z" />
  </svg>
);

const IconShorts = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
  </svg>
);

const IconPexels = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconAnimation = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const PRODUCER_NAV_ITEMS = [
  {
    section: "Principal",
    items: [
      { href: "/dashboard", icon: <IconDashboard />, label: "Dashboard" },
      { href: "/projects", icon: <IconProjects />, label: "Mis Proyectos" },
      { href: "/media", icon: <IconMedia />, label: "Media Explorer" },
      { href: "/media/catalog", icon: <IconMedia />, label: "Productor Audiovisual" },
      { href: "/tasks", icon: <IconTasks />, label: "Process Monitor" },
      { href: "/schedules", icon: <IconCalendar />, label: "Planificación" },
    ],
  },
  {
    section: "Generadores",
    items: [
      { href: "/studio", icon: <IconStudio />, label: "Studio Music" },
      { href: "/studio/youtube", icon: <IconStudio />, label: "▶ YouTube Studio 360°" },
      { href: "/playlist", icon: <IconPlaylist />, label: "Music Playlist" },
      { href: "/audiobooks", icon: <IconBooks />, label: "Audiobooks" },
      { href: "/shorts", icon: <IconShorts />, label: "Videomaker" },
      { href: "/studio/flow", icon: <IconTasks />, label: "⚡ Pipeline Flow Studio" },
      { href: "/studio/timeline", icon: <IconAnimation />, label: "Timeline Studio" },
      { href: "/stream", icon: <IconTasks />, label: "Live 24/7 Suite" },
      { href: "/live", icon: <IconTasks />, label: "🔴 Live Studio" },
    ],
  },
  {
    section: "Servicios",
    items: [
      { href: "/pexels", icon: <IconPexels />, label: "Pexels Stock" },
      { href: "/animation", icon: <IconAnimation />, label: "Animation Studio" },
      { href: "/animation/toon", icon: <IconAnimation />, label: "🎭 Toon Studio (2D)" },
      { href: "/voice-studio", icon: <IconBooks />, label: "🎙️ Voice Studio (Clonación)" },
    ],
  },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [user, setUser] = useState<{ username: string; email: string; role: string; tokens_balance: number } | null>(null);

  useEffect(() => {
    fetch("/api/ecommerce/me/info")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.authenticated && data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  // Polling para tareas activas — non-blocking con timeout
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch("/api/tasks/list", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          setActiveTasks(data.tasks || []);
        }
      } catch {
        // Silently ignore
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  const sidebarContent = (
    <>
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/[0.04]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-cyan flex items-center justify-center text-white font-black text-lg shadow-lg shadow-accent/20 shrink-0">
          M
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <h1 className="text-base font-black tracking-tight premium-gradient-text">
              MediaSuite
            </h1>
            <p className="text-[0.6rem] text-text-muted font-medium uppercase tracking-widest">AI Creative Lab</p>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-6 custom-scrollbar">
        {(user?.role === 'client' ? [] : PRODUCER_NAV_ITEMS).map((section) => (
          <div key={section.section}>
            {!collapsed && (
              <p className="px-3 mb-3 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-text-muted/60">
                {section.section}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onClose?.()}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold
                      transition-all duration-300 group relative
                      ${isActive
                        ? "bg-accent/10 text-accent-hover shadow-accent border border-accent/10"
                        : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03] border border-transparent"
                      }
                    `}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent rounded-r-full shadow-[0_0_8px_rgba(124,58,237,0.5)]" />
                    )}
                    <span className={`text-xl transition-transform duration-300 group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}>{item.icon}</span>
                    {!collapsed && (
                      <span className="truncate tracking-tight">{item.label}</span>
                    )}
                    {!collapsed && activeTasks.some(t => t.name.includes(item.label.toLowerCase().replace(' ', ''))) && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(124,58,237,0.8)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── Active Pipelines ── */}
        {!collapsed && user?.role !== 'client' && activeTasks.length > 0 && (
          <div className="pt-2 animate-fade-in px-2">
            <div className="bg-gradient-to-br from-accent/10 to-transparent rounded-2xl p-3 border border-accent/10">
              <p className="text-[0.6rem] font-black uppercase tracking-wider text-accent mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                Live Pipelines ({activeTasks.length})
              </p>
              <div className="space-y-2">
                {activeTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="text-[0.65rem] space-y-1 opacity-80 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-text-primary truncate">{task.name.split('.').pop()?.replace('_task', '')}</span>
                      <span className="text-[0.5rem] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-black italic">
                        {task.status}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-accent animate-[loading_2s_infinite]" style={{width: '30%'}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ── User Profile removed (now in header) ── */}

      {/* ── Footer ── */}
      <div className="border-t border-white/[0.04] p-4 space-y-3">
        {!collapsed && user?.role !== 'client' && (
          <>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[0.7rem] font-bold text-text-secondary uppercase tracking-widest">Engine Ready</span>
            </div>
          </>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full hidden lg:flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[0.65rem] font-bold uppercase tracking-widest text-text-muted hover:text-text-primary hover:bg-white/[0.04] transition-all"
        >
          <span className={`text-sm transition-transform duration-500 ${collapsed ? "rotate-180" : ""}`}>
            􀄪
          </span>
          {!collapsed && <span>Collapse View</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`
          hidden lg:flex flex-col h-full border-r border-white/[0.04]
          bg-bg-secondary transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) shrink-0
          ${collapsed ? "w-[80px]" : "w-[260px]"}
        `}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      <div 
        className={`
          fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300 lg:hidden
          ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        onClick={onClose}
      >
        <aside
          className={`
            absolute left-0 top-0 h-full w-[280px] bg-bg-secondary flex flex-col
            transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1)
            ${isOpen ? "translate-x-0" : "-translate-x-full"}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  );
}

