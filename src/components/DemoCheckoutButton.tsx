"use client";

import { demoCheckoutEnabled } from "@/utils/paypalMode";

interface DemoCheckoutButtonProps {
  checkoutItem: { id: number; title: string };
  guestEmail: string;
  guestUsername?: string;
  guestPassword?: string;
  autoRegister?: boolean;
  isAuthenticated: boolean;
  channelSlug?: string;
  planName?: string | null;
  onSuccess: (data: any) => void;
  setProcessing: (value: boolean) => void;
  processing: boolean;
}

/**
 * Local/judge fallback when real PayPal credentials are not configured.
 * Rendered only when NEXT_PUBLIC_DEMO_CHECKOUT=1, so production never shows it.
 */
export default function DemoCheckoutButton({
  checkoutItem,
  guestEmail,
  guestUsername,
  guestPassword,
  autoRegister,
  isAuthenticated,
  channelSlug,
  planName,
  onSuccess,
  setProcessing,
  processing,
}: DemoCheckoutButtonProps) {
  if (!demoCheckoutEnabled()) return null;

  const handleDemoCheckout = async () => {
    if (planName && !isAuthenticated) {
      alert("Inicia sesión con una cuenta demo (demojudge / PayPalDemo2026!) para probar la suscripción.");
      return;
    }
    if (!planName && !isAuthenticated && !guestEmail.includes("@")) {
      alert("Ingresa un correo válido para la compra demo.");
      return;
    }

    setProcessing(true);
    try {
      const endpoint = planName
        ? "/api/ecommerce/demo/subscribe"
        : "/api/ecommerce/demo/purchase";
      const body = planName
        ? { plan_name: planName, payment_method: "paypal", sandbox_mode: true }
        : {
            media_catalog_id: checkoutItem.id,
            payment_method: "paypal",
            guest_email: !isAuthenticated ? guestEmail : undefined,
            guest_username: guestUsername || (guestEmail ? guestEmail.split("@")[0] : undefined),
            guest_password: guestPassword || undefined,
            auto_register: autoRegister && !isAuthenticated,
            channel_slug: channelSlug,
            sandbox_mode: true,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (res.ok && data.success) {
        onSuccess(data);
      } else {
        alert(`No se pudo completar la compra demo (HTTP ${res.status}): ${data.detail || "revisa el backend"}`);
      }
    } catch {
      alert("No se pudo conectar con el servidor para la compra demo.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleDemoCheckout}
        disabled={processing}
        className="w-full py-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs font-bold uppercase tracking-wider hover:bg-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? "Procesando..." : "Pagar en modo demo (sin cargo)"}
      </button>
      <p className="text-center text-[0.6rem] text-white/30">
        Evaluación local: registra la compra sin usar PayPal ni cobrar dinero.
      </p>
    </div>
  );
}
