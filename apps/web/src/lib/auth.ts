'use client';

import type { UserProfile } from '@presspass/shared';

const TOKEN_KEY = 'presspass.token';
const USER_KEY = 'presspass.user';
const UNLOCK_KEY = 'presspass.unlock';

export function saveSession(token: string, user: UserProfile, unlockToken?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // The unlock token is an opaque reference to a short-lived (≤15 min) in-memory
  // server session — it holds no key material. Keeping it in localStorage lets a
  // reopened app resume within that window instead of erroring; it is cleared on
  // logout and rejected by the server once the session expires.
  if (unlockToken) localStorage.setItem(UNLOCK_KEY, unlockToken);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function saveUnlockToken(token: string): void {
  localStorage.setItem(UNLOCK_KEY, token);
}

/** Replaces just the access token (used by the silent refresh flow). */
export function saveAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getUnlockToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(UNLOCK_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(UNLOCK_KEY);
  // Also drop any token left in sessionStorage by earlier versions.
  sessionStorage.removeItem(UNLOCK_KEY);
}
