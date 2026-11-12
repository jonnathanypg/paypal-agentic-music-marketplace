"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isSandboxMode } from "@/utils/paypalMode";

function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const reason = searchParams.get("reason");

  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [accountType, setAccountType] = useState<"artist" | "fan">(
    redirect.includes("artist-studio") ? "artist" : "artist"
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [mounted, setMounted] = useState(false);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [demoLoading, setDemoLoading] = useState<"artist" | "fan" | null>(null);
  // PayPal Identity Quick-Sync Modal State
  const [showPayPalModal, setShowPayPalModal] = useState(false);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalStageName, setPaypalStageName] = useState("");
  const [paypalMerchantId, setPaypalMerchantId] = useState("");
  const [paypalPayoutMode, setPaypalPayoutMode] = useState("instant");
  const [paypalLoading, setPaypalLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const targetRedirect = accountType === "artist" ? "/artist-studio" : (redirect !== "/login" ? redirect : "/");
      const res = await fetch(
        `/api/auth/google/login-url?account_type=${accountType}&redirect=${encodeURIComponent(targetRedirect)}`
      );
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.detail || "No se pudo iniciar Google OAuth");
        setLoading(false);
      }
    } catch {
      setError("Error conectando con Google OAuth");
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    const active = isSandboxMode();
    setSandboxMode(active);
    if (active) setMode("login");
  }, []);

  const isSandbox = (mounted && sandboxMode) || searchParams.get("sandbox") === "1";

  // If the URL already has sandbox=1 (before JS hydration), never show the form.
  // This avoids a 1-frame flash of the production form before the sandbox state loads.
  const sandboxByUrl = searchParams.get("sandbox") === "1";
  const showForm = !isSandbox && !sandboxByUrl;

  const handleDemoLogin = async (role: "artist" | "fan") => {
    setError("");
    setSuccess("");
    setDemoLoading(role);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: role === "artist" ? "demojudge" : "demobuyer",
          password: "PayPalDemo2026!",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAccountType(role);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("exito_sandbox_mode", "1");
          document.cookie = "exito_sandbox_mode=1; path=/; max-age=2592000; SameSite=Lax";
          if (data.token) {
            document.cookie = `mediasuite_session=${data.token}; path=/; max-age=2592000; SameSite=Lax`;
          }
        }
        const base = role === "artist" ? "/artist-studio" : "/channel/billionaire-records-demo";
        const targetUrl = base + (base.includes("?") ? "&" : "?") + "sandbox=1";
        window.location.href = targetUrl;
      } else {
        setError(data.detail || "No se pudo iniciar la cuenta demo");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setDemoLoading(null);
    }
  };

  const handlePayPalIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPaypalLoading(true);
    try {
      const res = await fetch("/api/auth/paypal-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: paypalEmail,
          stage_name: paypalStageName || undefined,
          account_type: accountType,
          paypal_merchant_id: paypalMerchantId || undefined,
          payout_mode: paypalPayoutMode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (typeof window !== "undefined") {
          localStorage.setItem("mediasuite_guest_email", paypalEmail.trim().toLowerCase());
        }
        setShowPayPalModal(false);
        const dest = accountType === "artist" ? "/artist-studio" : (redirect !== "/login" ? redirect : "/");
        router.push(dest);
      } else {
        setError(data.detail || "No se pudo sincronizar con PayPal");
      }
    } catch {
      setError("Error de conexión con PayPal Identity");
    } finally {
      setPaypalLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "register" && password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const target =
            redirect && redirect !== "/login" && redirect !== "/"
              ? redirect
              : accountType === "artist"
              ? "/artist-studio"
              : data.role === "super_admin" || data.role === "tools_admin"
              ? "/dashboard"
              : "/";
          router.push(target);
        } else {
          setError(data.detail || "Credenciales incorrectas");
        }
      } else if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (typeof window !== "undefined" && email) {
            localStorage.setItem("mediasuite_guest_email", email.trim().toLowerCase());
          }
          router.push(accountType === "artist" ? "/artist-studio" : "/");
        } else {
          setError(data.detail || "Error al registrarse");
        }
      } else if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setSuccess("Se ha enviado un enlace de recuperación a tu correo");
          if (data.reset_token) {
            setResetToken(data.reset_token);
          }
        } else {
          setError(data.detail || "Error al solicitar recuperación");
        }
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(circle at 30% 20%,rgba(124,58,237,.14) 0%,transparent 50%),radial-gradient(circle at 70% 80%,rgba(0,112,186,.14) 0%,transparent 50%),#0a0a1a",
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <Link href="/">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#c9a84c] via-[#7c3aed] to-[#0070ba] flex items-center justify-center text-white font-black text-3xl shadow-2xl shadow-purple-500/25 mx-auto mb-3 cursor-pointer hover:scale-105 transition-transform">
              E
            </div>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-tight">EXITO.CYOU</h1>
          <p className="text-white/50 text-xs mt-1">
            AI Music Streaming, Independent Artist Studio & PayPal Agentic Marketplace
          </p>
          {isSandbox && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
              PayPal Sandbox Demo
            </div>
          )}
        </div>

        {/* ── Acceso rápido demo (solo sandbox) ── */}
        {isSandbox && (
          <div className="mb-4 space-y-2.5 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-center text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
              Acceso rápido a la demo
            </p>
            <button
              type="button"
              onClick={() => handleDemoLogin("fan")}
              disabled={demoLoading !== null}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#0070ba] to-[#06b6d4] text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              <span className="text-base">🎧</span>
              <span>{demoLoading === "fan" ? "Entrando como fan..." : "Entrar como Fan"}</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin("artist")}
              disabled={demoLoading !== null}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#c9a84c] to-[#e6c565] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg hover:brightness-105 transition-all disabled:opacity-50"
            >
              <span className="text-base">🎤</span>
              <span>{demoLoading === "artist" ? "Entrando como artista..." : "Entrar como Artista"}</span>
            </button>
            <p className="text-center text-[10px] text-white/40">
              Sin registro · Sin dinero real · PayPal Sandbox
            </p>
          </div>
        )}
        {isSandbox && (
          <div className="mt-3 text-center">
            <Link href="/?sandbox=1" className="text-xs text-white/30 hover:text-white/60 transition-colors">
              ← Volver a Exito.cyou
            </Link>
          </div>
        )}

        {/* ── Selector de Rol: Artista vs Fan (producción) ── */}
        {mode !== "forgot" && showForm && (
          <div className="mb-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setAccountType("artist")}
              className={`py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                accountType === "artist"
                  ? "bg-gradient-to-r from-[#c9a84c] to-[#e6c565] text-black shadow-lg"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <span>🎤</span> Soy Artista / Sello
            </button>
            <button
              type="button"
              onClick={() => setAccountType("fan")}
              className={`py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                accountType === "fan"
                  ? "bg-gradient-to-r from-[#0070ba] to-[#06b6d4] text-white shadow-lg"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <span>🎧</span> Soy Fan / Oyente
            </button>
          </div>
        )}

        {reason === "expired" && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 text-center">
            <p className="text-amber-400 text-xs">Tu sesión ha expirado. Inicia sesión nuevamente.</p>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-3.5 text-center">
            <p className="text-red-400 text-xs font-semibold">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-2xl p-3.5 text-center">
            <p className="text-green-400 text-xs font-semibold">{success}</p>
          </div>
        )}

        {/* ── Acceso rápido de producción (PayPal Identity & Google OAuth) ── */}
        {mode !== "forgot" && showForm && (
          <div className="space-y-2.5 mb-5">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-white text-gray-900 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg hover:bg-gray-100 transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.54-5.17 3.54-8.97z"
                />
                <path
                  fill="#34A853"
                  d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96h-4.01v3.14C3.515 21.3 7.565 24 12.255 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.535 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62h-4.01C.705 8.24.255 10.06.255 12s.45 3.76 1.27 5.38l4.01-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.525 6.62l4.01 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>
                {accountType === "artist"
                  ? "Continuar con Google / Canal YouTube"
                  : "Continuar con Google"}
              </span>
            </button>

            <div className="flex items-center gap-3 pt-2">
              <div className="h-px bg-white/10 flex-1" />
              <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">
                o con usuario y contraseña
              </span>
              <div className="h-px bg-white/10 flex-1" />
            </div>
          </div>
        )}

        {/* ── Tab Selector (producción) ── */}
        {mode !== "forgot" && showForm && (
          <div className="flex mb-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-1">
            <button
              onClick={() => {
                setMode("login");
                setError("");
                setSuccess("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === "login"
                  ? "bg-purple-500/20 text-purple-300 shadow-sm"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => {
                setMode("register");
                setError("");
                setSuccess("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === "register"
                  ? "bg-purple-500/20 text-purple-300 shadow-sm"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              Crear Cuenta Gratis
            </button>
          </div>
        )}

        {!isSandbox && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-7 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "forgot" ? (
              <>
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>
                {resetToken && (
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                    <p className="text-cyan-400 text-xs break-all">
                      Token de recuperación: {resetToken}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                    Usuario o Email
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="usuario o correo"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>
                {mode === "register" && (
                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                      Correo Electrónico (Sincronizable con PayPal)
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>
                {mode === "register" && (
                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                      Confirmar Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                    />
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white font-black text-xs uppercase tracking-wider transition-all hover:shadow-[0_8px_30px_rgba(124,58,237,0.4)] hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading
                ? "Procesando..."
                : mode === "login"
                ? "Entrar a mi Cuenta"
                : mode === "register"
                ? accountType === "artist"
                  ? "Crear Cuenta de Artista Gratis"
                  : "Crear Cuenta de Fan Gratis"
                : "Enviar Instrucciones"}
            </button>
          </form>

          <div className="mt-5 space-y-2.5 text-center">
            {mode === "login" && !isSandbox && (
              <button
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setSuccess("");
                  setResetToken("");
                }}
                className="text-xs text-white/30 hover:text-purple-400 transition-colors block w-full"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
            {mode === "forgot" && (
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                  setSuccess("");
                  setResetToken("");
                }}
                className="text-xs text-white/30 hover:text-purple-400 transition-colors"
              >
                ← Volver a Iniciar Sesión
              </button>
            )}
            <Link
              href="/"
              className="text-xs text-white/30 hover:text-white/60 transition-colors block"
            >
              ← Volver a Exito.cyou
            </Link>
          </div>
        </div>
        )}

        {/* ── Modal de Sincronización Instantánea con PayPal ── */}
        {showPayPalModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#0d1224] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#003087] to-[#0070ba] flex items-center justify-center text-white font-black text-lg">
                    P
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">
                      PayPal Identity & Instant Sync
                    </h3>
                    <p className="text-[11px] text-cyan-300/80">
                      {accountType === "artist"
                        ? "Sincroniza tu correo PayPal para recibir el 85% de tus ventas"
                        : "Sincroniza tu correo PayPal para compras Express en 1 clic"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPayPalModal(false)}
                  className="text-white/40 hover:text-white text-lg px-2"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handlePayPalIdentitySubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                    Correo de tu cuenta PayPal *
                  </label>
                  <input
                    type="email"
                    required
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    placeholder="artista@paypal.com"
                    className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                  />
                </div>

                {accountType === "artist" && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                        Nombre Artístico / Sello Musical
                      </label>
                      <input
                        type="text"
                        value={paypalStageName}
                        onChange={(e) => setPaypalStageName(e.target.value)}
                        placeholder="Ej: Luna Vallenata / Sovereign Beats"
                        className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                          Modo de Retiro PayPal
                        </label>
                        <select
                          value={paypalPayoutMode}
                          onChange={(e) => setPaypalPayoutMode(e.target.value)}
                          className="w-full bg-[#131b33] border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                        >
                          <option value="instant">⚡ Inmediato (Cada venta)</option>
                          <option value="threshold">🎯 Por Umbral ($50 USD)</option>
                          <option value="scheduled_weekly">📅 Semanal</option>
                          <option value="scheduled_monthly">🗓️ Mensual</option>
                          <option value="manual">🖐️ Manual / A demanda</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                          Merchant ID (Opcional)
                        </label>
                        <input
                          type="text"
                          value={paypalMerchantId}
                          onChange={(e) => setPaypalMerchantId(e.target.value)}
                          placeholder="Auto / Opcional"
                          className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 text-[11px] text-cyan-200 leading-relaxed">
                  {accountType === "artist" ? (
                    <>
                      ✅ <strong>Zero Pre-Funding Split:</strong> Tu cuenta quedará verificada con PayPal Live API. Recibirás el <strong>85% neto</strong> de cada canción o álbum vendido y acceso inmediato al <strong>Artist Studio</strong>.
                    </>
                  ) : (
                    <>
                      ✅ <strong>Fan Express Checkout:</strong> Tu correo PayPal quedará vinculado para descargar pistas MP3 y álbumes al instante y reaccionar con <strong>♥</strong> a tus artistas favoritos.
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={paypalLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#ffc439] to-[#f59e0b] text-black font-black text-xs uppercase tracking-wider shadow-lg hover:brightness-105 transition-all disabled:opacity-50"
                >
                  {paypalLoading
                    ? "Sincronizando con PayPal Live..."
                    : accountType === "artist"
                    ? "Vincular PayPal y Entrar al Artist Studio →"
                    : "Vincular PayPal y Entrar a Escuchar →"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Reset Password (when token is available) ── */}
        {resetToken && (
          <ResetPasswordForm
            token={resetToken}
            onSuccess={() => {
              setResetToken("");
              setSuccess("Contraseña actualizada. Ahora puedes iniciar sesión.");
              setMode("login");
            }}
          />
        )}
      </div>
    </div>
  );
}

function ResetPasswordForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPass }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess();
      } else {
        setError(data.detail || "Error al restablecer");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 bg-white/[0.03] border border-white/[0.06] rounded-3xl p-8 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <h3 className="text-sm font-bold text-white mb-4 text-center">Restablecer Contraseña</h3>
      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
            Nueva Contraseña
          </label>
          <input
            type="password"
            required
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
        <div>
          <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
            Confirmar Nueva Contraseña
          </label>
          <input
            type="password"
            required
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-sm uppercase tracking-wider transition-all hover:shadow-[0_8px_30px_rgba(6,182,212,0.4)] hover:-translate-y-0.5 disabled:opacity-50"
        >
          {loading ? "Actualizando..." : "Restablecer Contraseña"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AuthPage />
    </Suspense>
  );
}
