/**
 * Key-file helpers for the admin encryption credential.
 *
 * A key-file is simply a high-entropy secret stored in a file instead of being
 * memorised. Its content is sent as the ordinary `passphrase`, so the server
 * and crypto are unchanged — Argon2id still derives the wrapping key from it.
 */

/** A fresh 32-byte secret, base64url-encoded (43 chars, well over the 12 min). */
export function generateKeyfileSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Triggers a browser download of the secret as a plain-text key-file. */
export function downloadKeyfile(secret: string, filename = 'presspass-admin.key'): void {
  const blob = new Blob([secret], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Reads a selected key-file and returns its trimmed content (the secret). */
export async function readKeyfile(file: File): Promise<string> {
  return (await file.text()).trim();
}
