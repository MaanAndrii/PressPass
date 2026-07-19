/**
 * Base URL of the REST API. All business logic lives behind this API.
 *
 * In production this is the RELATIVE path `/api` (Nginx proxies it to the
 * NestJS process), so the site works no matter which host/IP the visitor
 * used to open it. In development it is an absolute URL (http://localhost:3001).
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

/**
 * Contact address shown on the legal pages (privacy policy / terms). Set via
 * NEXT_PUBLIC_CONTACT_EMAIL in .env (the installer defaults it to the platform
 * administrator's email). Empty → the pages point to the site administrator
 * without printing an address.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '';

/**
 * Base URL for server-side rendering (the /verify page fetches the API from
 * the Next.js process itself). A relative path is not a valid fetch URL in
 * Node, so SSR talks to the API directly, bypassing Nginx.
 */
export function apiBaseForServer(): string {
  if (process.env.API_INTERNAL_URL) {
    return process.env.API_INTERNAL_URL;
  }
  return API_URL.startsWith('http') ? API_URL : 'http://127.0.0.1:3001';
}

/** Resolves a photo path returned by the API into a browser-loadable URL. */
export function photoUrl(photoPath: string | null): string | null {
  if (!photoPath) {
    return null;
  }
  if (photoPath.startsWith('http')) {
    return photoPath;
  }
  // Only protected media is served by the API (dev: its own origin; prod: /api
  // behind Nginx). Static assets like /icons/logo.svg or /placeholders/* are
  // served by the web app itself, so they must NOT get the API prefix.
  if (photoPath.startsWith('/media/') || photoPath.startsWith('/public-media/')) {
    return `${API_URL}${photoPath}`;
  }
  return photoPath;
}
