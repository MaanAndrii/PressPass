'use client';

import type { UserProfile } from '@presspass/shared';

const TOKEN_KEY = 'presspass.token';
const USER_KEY = 'presspass.user';
const UNLOCK_KEY = 'presspass.unlock';

export function saveSession(token: string, user: UserProfile, unlockToken?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (unlockToken) sessionStorage.setItem(UNLOCK_KEY, unlockToken);
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
  sessionStorage.setItem(UNLOCK_KEY, token);
}

export function getUnlockToken(): string | null {
  return typeof window === 'undefined' ? null : sessionStorage.getItem(UNLOCK_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(UNLOCK_KEY);
}
