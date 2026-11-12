import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Éxito.cyou — Acceso',
  robots: 'noindex, nofollow',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};
export default function LoginLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
