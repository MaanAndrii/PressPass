import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'PressPass — електронне посвідчення журналіста',
  description: 'Видача, адміністрування та перевірка електронних журналістських посвідчень',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PressPass',
  },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
