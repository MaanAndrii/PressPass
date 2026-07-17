'use client';
import { Button, Field } from '@presspass/ui';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getToken, saveSession, saveUnlockToken } from '@/lib/auth';

export default function EncryptionUnlockPage() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const enroll = sessionStorage.getItem('presspass.encryptionEnrollment') === '1';
      const result = await api<{ unlockToken: string }>(
        enroll ? '/encryption/enroll' : '/encryption/unlock',
        { method: 'POST', body: { passphrase } },
      );
      saveUnlockToken(result.unlockToken);
      sessionStorage.removeItem('presspass.encryptionEnrollment');
      const user = await api<import('@presspass/shared').UserProfile>('/me');
      const token = getToken();
      if (token) saveSession(token, user, result.unlockToken);
      router.replace(
        user.role === 'JOURNALIST'
          ? user.journalist?.profileComplete
            ? '/card'
            : '/profile'
          : '/admin',
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
        <h1 className="text-xl font-bold">Шифрування даних</h1>
        <p className="text-sm text-slate-600">
          Введіть окрему криптографічну фразу. Вона не зберігається на сервері й потрібна для
          розблокування приватних даних.
        </p>
        <Field
          label="Криптографічна фраза"
          type="password"
          minLength={12}
          required
          autoComplete="off"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" disabled={loading}>
          {loading ? 'Розблокування…' : 'Продовжити'}
        </Button>
      </form>
    </main>
  );
}
