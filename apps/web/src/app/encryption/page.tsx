'use client';
import { Button, Field } from '@presspass/ui';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getStoredUser, getToken, saveSession, saveUnlockToken } from '@/lib/auth';
import { EncryptionCredentialInput } from '@/components/EncryptionCredentialInput';

/** A safe internal redirect target from the ?next= query, else null. */
function nextTarget(): string | null {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export default function EncryptionUnlockPage() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Enrollment (first-time) may generate a fresh key-file; unlock must not.
  const [enroll, setEnroll] = useState(false);
  const isJournalist = getStoredUser()?.role === 'JOURNALIST';
  useEffect(() => {
    setEnroll(sessionStorage.getItem('presspass.encryptionEnrollment') === '1');
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const enrolling = sessionStorage.getItem('presspass.encryptionEnrollment') === '1';
      const result = await api<{ unlockToken: string }>(
        enrolling ? '/encryption/enroll' : '/encryption/unlock',
        { method: 'POST', body: { passphrase } },
      );
      saveUnlockToken(result.unlockToken);
      sessionStorage.removeItem('presspass.encryptionEnrollment');
      const user = await api<import('@presspass/shared').UserProfile>('/me');
      const token = getToken();
      if (token) saveSession(token, user, result.unlockToken);
      router.replace(
        nextTarget() ??
          (user.role === 'JOURNALIST'
            ? user.journalist?.profileComplete
              ? '/card'
              : '/profile'
            : '/admin'),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не вдалося розблокувати дані');
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-xl font-bold">Розблокування даних</h1>
        <p className="text-sm text-slate-600">
          {isJournalist
            ? 'Введіть свій пароль, щоб розблокувати посвідчення. Ключі не зберігаються на пристрої, тож пароль потрібен після повторного відкриття застосунку.'
            : 'Введіть окрему криптографічну фразу (або ключ-файл). Вона не зберігається на сервері й потрібна для розблокування приватних даних.'}
        </p>
        {isJournalist ? (
          <Field
            label="Пароль"
            type="password"
            autoComplete="current-password"
            required
            minLength={enroll ? 12 : 8}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        ) : (
          <EncryptionCredentialInput
            label="Криптографічна фраза"
            value={passphrase}
            onChange={setPassphrase}
            allowGenerate={enroll}
            generateFilename="presspass-admin.key"
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" disabled={loading}>
          {loading ? 'Розблокування…' : 'Продовжити'}
        </Button>
      </form>
    </main>
  );
}
