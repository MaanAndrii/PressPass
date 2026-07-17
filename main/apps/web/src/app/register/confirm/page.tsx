'use client';

import { Button, Field } from '@presspass/ui';
import type { LoginResponse, RegisterResponse } from '@presspass/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { saveSession } from '@/lib/auth';

function ConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const result = await api<LoginResponse>('/auth/verify-email', {
        method: 'POST',
        body: { email, code },
        auth: false,
      });
      saveSession(result.accessToken, result.user);
      // Після підтвердження — одразу до анкети.
      router.replace('/profile');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося підтвердити код.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    try {
      const result = await api<RegisterResponse>('/auth/resend-code', {
        method: 'POST',
        body: { email },
        auth: false,
      });
      setInfo(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося надіслати код.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-blue-700">Підтвердження пошти</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Ми надіслали 6-значний код на вашу електронну пошту
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Код із листа"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            placeholder="000000"
            className="text-center font-mono text-xl tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}
          <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
            {loading ? 'Перевірка…' : 'Підтвердити'}
          </Button>
        </form>
        <button
          onClick={() => void handleResend()}
          className="mt-4 w-full text-center text-sm text-blue-700 hover:underline"
        >
          Надіслати код повторно
        </button>
      </div>
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmForm />
    </Suspense>
  );
}
