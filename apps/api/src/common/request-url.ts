import type { Request } from 'express';

/**
 * The public origin (scheme://host) the request actually arrived on, derived
 * from the reverse-proxy headers set by Nginx/Cloudflare. Used to build the
 * QR verify URL so it follows whatever domain the app was opened on — instead
 * of a hard-coded VERIFY_BASE_URL. Falls back to the given value when the host
 * can't be determined (e.g. non-HTTP contexts).
 */
export function requestBaseUrl(req: Request, fallback: string): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https')
    .split(',')[0]
    ?.trim();
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').trim();
  if (!host) {
    return fallback.replace(/\/+$/, '');
  }
  return `${proto}://${host}`.replace(/\/+$/, '');
}
