import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const REMOTION_URL = process.env.REMOTION_URL || "http://localhost:8006";
// MediaMTX policed: WHIP/WHEP (:8889) + HLS (:8888) + Playback (:9996) en el mismo VPS.
const MEDIAMTX_WHIP_URL = process.env.MEDIAMTX_WHIP_URL || "http://127.0.0.1:8889";
const MEDIAMTX_HLS_URL = process.env.MEDIAMTX_HLS_URL || "http://127.0.0.1:8888";
const MEDIAMTX_PLAYBACK_URL = process.env.MEDIAMTX_PLAYBACK_URL || "http://127.0.0.1:9996";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'media.weblifetech.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      }
    ]
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
      {
        source: "/media-static/:path*",
        destination: `${BACKEND_URL}/media-static/:path*`,
      },
      {
        source: "/remotion-studio/:path*",
        destination: `${REMOTION_URL}/:path*`,
      },
      {
        source: "/remotion-studio",
        destination: `${REMOTION_URL}/`,
      },
      // Perfiles de Creador: /@slug → /channel/slug
      // Permite URLs tipo media.weblifetech.com/@billionairesplaylist
      {
        source: "/@:slug",
        destination: "/channel/:slug",
      },
      // ── Live Studio: WHIP/WHEP → MediaMTX :8889 ──
      // El navegador publica (WHIP POST SDP) y previsualiza (WHEP) por HTTPS
      // sin exponer puertos. Requiere el bloque /live-preview/ en Nginx prod.
      {
        source: "/live-preview/:path*",
        destination: `${MEDIAMTX_WHIP_URL}/:path*`,
      },
      // ── Live Studio: HLS LL preview → MediaMTX :8888 (fallback) ──
      {
        source: "/live-hls/:path*",
        destination: `${MEDIAMTX_HLS_URL}/:path*`,
      },
      // ── Live Studio: Playback grabaciones → MediaMTX :9996 ──
      // Reproducción/descarga de grabaciones fMP4/MP4 (Range ok, <video> nativo).
      {
        source: "/live-recordings/:path*",
        destination: `${MEDIAMTX_PLAYBACK_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
