'use client';
import type { Role, UserProfile } from '@presspass/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { saveSession } from '@/lib/auth';
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('token');
    const id = Number(fragment.get('user'));
    const role = fragment.get('role') as Role | null;
    if (!token || !id || !role) {
      setError('Токен не отримано. Спробуйте увійти ще раз.');
      return;
    }
    const user: UserProfile = {
      id,
      email: '',
      role,
      emailVerified: true,
      editorialId: fragment.get('editorial') ? Number(fragment.get('editorial')) : null,
      journalist: null,
      memberships: [],
    };
    saveSession(token, user);
    sessionStorage.setItem(
      'presspass.encryptionEnrollment',
      fragment.get('enrollment') === '1' ? '1' : '0',
    );
    history.replaceState(null, '', location.pathname);
    router.replace('/encryption');
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
