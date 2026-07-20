'use client';

import { API_URL } from './config';
import { getStoredUser, getToken, getUnlockToken, saveAccessToken, saveUnlockToken } from './auth';
import { forgetDeviceKey, recoverDeviceKey, rememberDeviceKey } from './deviceKey';

/**
 * Silent session helpers used by the API wrapper to keep a PWA signed in without
 * re-entering the password: rotate the access token via the HttpOnly refresh
 * cookie, and re-open the encryption unlock session from the device-held key.
 * These use raw fetch (never the api() wrapper) so they cannot recurse.
 */

let refreshInFlight: Promise<boolean> | null = null;
let deviceUnlockInFlight: Promise<boolean> | null = null;

/** Exchanges the refresh cookie for a new access token. Deduped across callers. */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken?: string };
        if (!data.accessToken) return false;
        saveAccessToken(data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** Re-opens the encryption unlock session from the device-held key. Deduped. */
export function tryDeviceUnlock(): Promise<boolean> {
  if (getStoredUser()?.role !== 'JOURNALIST') return Promise.resolve(false);
  if (!deviceUnlockInFlight) {
    deviceUnlockInFlight = (async () => {
      try {
        const dek = await recoverDeviceKey();
        if (!dek) return false;
        const token = getToken();
        const res = await fetch(`${API_URL}/encryption/device/unlock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ profileKey: dek }),
        });
        if (!res.ok) {
          // A stale/invalid device key is useless — forget it so the app falls
          // back to a password unlock instead of looping.
          if (res.status === 400) await forgetDeviceKey();
          return false;
        }
        const data = (await res.json()) as { unlockToken?: string };
        if (!data.unlockToken) return false;
        saveUnlockToken(data.unlockToken);
        return true;
      } catch {
        return false;
      } finally {
        deviceUnlockInFlight = null;
      }
    })();
  }
  return deviceUnlockInFlight;
}

/**
 * Remembers this device after a password unlock so future opens skip the
 * password. Journalists only; requires an active unlock session to read the DEK.
 */
export async function enrollDevice(): Promise<void> {
  if (getStoredUser()?.role !== 'JOURNALIST') return;
  const token = getToken();
  const unlock = getUnlockToken();
  if (!token || !unlock) return;
  try {
    const res = await fetch(`${API_URL}/encryption/device/key`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'X-Unlock-Token': unlock },
      credentials: 'include',
    });
    if (!res.ok) return;
    const data = (await res.json()) as { profileKey?: string };
    if (data.profileKey) await rememberDeviceKey(data.profileKey);
  } catch {
    // best-effort; the app still works with a password unlock
  }
}
