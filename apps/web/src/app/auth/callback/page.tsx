'use client';

import type { UserProfile } from '@presspass/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { saveSession } from '@/lib/auth';

/**
 * Завершення входу через Google: API повертає сюди з JWT у фрагменті URL
 * (#token=...), який не потрапляє ні в логи сервера, ні в історію проксі.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) {
      setError('Токен не отримано. Спробуйте увійти ще раз.');
      return;
    }
    // Токен ще не в сховищі — профіль запитуємо явно з ним.
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) {
          throw new ApiError(response.status, 'Не вдалося отримати профіль');
        }
        const user = (await response.json()) as UserProfile;
        saveSession(token, user);
        if (user.role === 'ADMIN') {
          router.replace('/admin');
        } else if (user.journalist && !user.journalist.profileComplete) {
          router.replace('/profile');
        } else {
          router.replace('/card');
        }
      })
      .catch(() => setError('Не вдалося завершити вхід. Спробуйте ще раз.'));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {error ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <p className="text-slate-500">Завершуємо вхід…</p>
      )}
    </main>
  );
}
