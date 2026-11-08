"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const reason = searchParams.get("reason");

  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetToken, setResetToken] = useState("");

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
          const target = data.role === "super_admin" || data.role === "tools_admin"
            ? (redirect !== "/login" ? redirect : "/dashboard")
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
          router.push("/");
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:'radial-gradient(circle at 30% 20%,rgba(124,58,237,.1) 0%,transparent 50%),radial-gradient(circle at 70% 80%,rgba(6,182,212,.08) 0%,transparent 50%),#0a0a1a'}}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#06b6d4] flex items-center justify-center text-white font-black text-3xl shadow-2xl shadow-purple-500/25 mx-auto mb-4 cursor-pointer hover:scale-105 transition-transform">
              M
            </div>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-tight">MediaSuite</h1>
          <p className="text-white/40 text-sm mt-1">
            {mode === "login" ? "Inicia sesión en tu cuenta" : mode === "register" ? "Crea tu cuenta gratis" : "Recupera tu contraseña"}
          </p>
        </div>

        {reason === "expired" && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
            <p className="text-amber-400 text-sm">Tu sesión ha expirado. Inicia sesión nuevamente.</p>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
            <p className="text-green-400 text-sm">{success}</p>
          </div>
        )}

        {/* ── Tab Selector ── */}
        {mode !== "forgot" && (
          <div className="flex mb-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-1">
            <button
              onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                mode === "login" ? "bg-purple-500/20 text-purple-300 shadow-sm" : "text-white/40 hover:text-white/70"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                mode === "register" ? "bg-purple-500/20 text-purple-300 shadow-sm" : "text-white/40 hover:text-white/70"
              }`}
            >
              Registrarse
            </button>
          </div>
        )}

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-8 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "forgot" ? (
              <>
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
                    Correo Electrónico
                  </label>
                  <input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>
                {resetToken && (
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                    <p className="text-cyan-400 text-xs break-all">
                      Token de recuperación: {resetToken}
                    </p>
                    <p className="text-white/40 text-[0.6rem] mt-1">
                      Usa este token en el endpoint /api/auth/reset-password
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
                    Usuario o Email
                  </label>
                  <input
                    type="text" required value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="usuario o correo"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>
                {mode === "register" && (
                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
                      Correo Electrónico
                    </label>
                    <input
                      type="email" required value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
                    Contraseña
                  </label>
                  <input
                    type="password" required value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>
                {mode === "register" && (
                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
                      Confirmar Contraseña
                    </label>
                    <input
                      type="password" required value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
                    />
                  </div>
                )}
              </>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white font-black text-sm uppercase tracking-wider transition-all hover:shadow-[0_8px_30px_rgba(124,58,237,0.4)] hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading
                ? "Procesando..."
                : mode === "login" ? "Iniciar Sesión" : mode === "register" ? "Crear Cuenta" : "Enviar Instrucciones"}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center">
            {mode === "login" && (
              <button
                onClick={() => { setMode("forgot"); setError(""); setSuccess(""); setResetToken(""); }}
                className="text-xs text-white/30 hover:text-purple-400 transition-colors block w-full"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
            {mode === "forgot" && (
              <button
                onClick={() => { setMode("login"); setError(""); setSuccess(""); setResetToken(""); }}
                className="text-xs text-white/30 hover:text-purple-400 transition-colors"
              >
                ← Volver a Iniciar Sesión
              </button>
            )}
            <Link href="/" className="text-xs text-white/30 hover:text-white/60 transition-colors block">
              ← Volver al Portal
            </Link>
          </div>
        </div>

        {/* ── Reset Password (when token is available) ── */}
        {resetToken && (
          <ResetPasswordForm token={resetToken} onSuccess={() => { setResetToken(""); setSuccess("Contraseña actualizada. Ahora puedes iniciar sesión."); setMode("login"); }} />
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
            type="password" required value={newPass}
            onChange={e => setNewPass(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
        <div>
          <label className="block text-[0.7rem] font-bold uppercase tracking-widest text-white/40 mb-2">
            Confirmar Nueva Contraseña
          </label>
          <input
            type="password" required value={confirmPass}
            onChange={e => setConfirmPass(e.target.value)}
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
          type="submit" disabled={loading}
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
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <AuthPage />
    </Suspense>
  );
}
