'use client';

import { Button, Field } from '@presspass/ui';
import { isAdminRole, type AuthConfig, type LoginResponse } from '@presspass/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { saveSession, saveUnlockToken } from '@/lib/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [encryptionPassphrase, setEncryptionPassphrase] = useState('');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'google'
      ? 'Вхід через Google не вдався. Спробуйте ще раз.'
      : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void api<AuthConfig>('/auth/config', { auth: false })
      .then((config) => setGoogleEnabled(config.googleEnabled))
      .catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      saveSession(result.accessToken, result.user, result.unlockToken);
      if (isAdminRole(result.user.role)) {
        if (!encryptionPassphrase)
          throw new ApiError(400, 'Введіть окрему криптографічну фразу адміністратора');
        const endpoint = result.encryptionEnrollmentRequired
          ? '/encryption/enroll'
          : '/encryption/unlock';
        const unlocked = await api<{ unlockToken: string }>(endpoint, {
          method: 'POST',
          body: { passphrase: encryptionPassphrase },
        });
        saveUnlockToken(unlocked.unlockToken);
        router.replace('/admin');
      } else if (result.user.journalist && !result.user.journalist.profileComplete) {
        router.replace('/profile');
      } else {
        router.replace('/card');
      }
    } catch (err) {
      if (err instanceof ApiError && err.message === 'EMAIL_NOT_VERIFIED') {
        // Реєстрацію не завершено — ведемо на сторінку підтвердження коду.
        router.push(`/register/confirm?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Не вдалося увійти. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <Link href="/" className="mb-4 block text-center text-2xl font-bold text-blue-700">
          PressPass
        </Link>
        <p className="mb-6 text-center text-sm text-slate-500">Електронне посвідчення журналіста</p>
        {/*
          Autofill is intentionally suppressed: the browser was re-applying a
          saved credential pair (and swapping the one the user picked) whenever
          the async /auth/config fetch re-rendered the form. `autoComplete="off"`
          on the form/email plus `new-password` on the password field is the
          reliable cross-browser way to stop saved-login autofill in Chrome.
        */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <Field
            label="Email"
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Пароль"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Криптографічна фраза (лише для адміністратора)"
            type="password"
            autoComplete="off"
            minLength={12}
            value={encryptionPassphrase}
            onChange={(e) => setEncryptionPassphrase(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Вхід…' : 'Увійти'}
          </Button>
        </form>

        {googleEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              або
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <a
              href={`${API_URL}/auth/google`}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.03c2.2-2.1 3.5-5.1 3.5-8.6z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.1 0-5.8-2.1-6.7-5l-.14.01-3.6 2.8-.05.13C3.5 21.3 7.4 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4l-.01-.16-3.65-2.8-.12.06C.6 8.2 0 10 0 12s.6 3.8 1.5 5.3l3.8-2.9z"
                />
                <path
                  fill="#EB4335"
                  d="M12 4.6c2.2 0 3.7 1 4.5 1.8l3.3-3.2C17.9 1.2 15.2 0 12 0 7.4 0 3.5 2.7 1.5 6.7l3.8 2.9c.9-2.9 3.6-5 6.7-5z"
                />
              </svg>
              Увійти через Google
            </a>
          </>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Немає акаунта?{' '}
          <Link href="/register" className="font-semibold text-blue-700 hover:underline">
            Зареєструватися
          </Link>
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/" className="text-slate-500 hover:underline">
            ← На головну
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
