'use client';

import { API_URL } from './config';
import { getToken, getUnlockToken } from './auth';
import { refreshAccessToken, tryDeviceUnlock } from './session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Attach the stored JWT (default: true). */
  auth?: boolean;
}

/**
 * Thin fetch wrapper around the REST API. The frontend contains no business
 * logic — every operation is a call to the NestJS backend.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const send = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth) {
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const unlock = getUnlockToken();
      if (unlock) headers['X-Unlock-Token'] = unlock;
    }
    return fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let response = await send();

  // Silent recovery for a PWA: a stale access token is refreshed via the cookie,
  // and an expired encryption unlock is re-opened from the device key. Retry once.
  if (auth && response.status === 401 && (await refreshAccessToken())) {
    response = await send();
  }
  if (auth && response.status === 400) {
    const peek = await response
      .clone()
      .json()
      .catch(() => null);
    if (peek?.message === 'Encryption unlock required' && (await tryDeviceUnlock())) {
      response = await send();
    }
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (data.message) {
        message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      }
    } catch {
      // Keep the generic message when the body is not JSON.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

/** Uploads a file as multipart/form-data. */
export async function apiUpload<T>(path: string, field: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append(field, file);

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const unlock = getUnlockToken();
  if (unlock) headers['X-Unlock-Token'] = unlock;

  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData });
  if (!response.ok) {
    throw new ApiError(response.status, `Upload failed (${response.status})`);
  }
  return (await response.json()) as T;
}
