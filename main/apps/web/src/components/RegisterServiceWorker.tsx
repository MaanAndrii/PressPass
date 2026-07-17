'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker (offline support for the card screen).
 * The admin panel is a separate desktop app and is never installable, so the
 * worker is not registered there.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) {
      return;
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service worker registration failed:', error);
      });
    }
  }, []);

  return null;
}
