import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'MediaSuite — Acceso',
  robots: 'noindex, nofollow',
  icons: {
    icon: [{ url: '/mediasuite-favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/mediasuite-favicon.svg',
    apple: '/mediasuite-favicon.svg',
  },
};
export default function LoginLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
