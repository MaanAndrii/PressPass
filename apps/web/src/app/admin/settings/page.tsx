'use client';

import { Button, Field } from '@presspass/ui';
import type { AppSettings } from '@presspass/shared';
import { type FormEvent, useEffect, useState } from 'react';

import { api, ApiError, apiUpload } from '@/lib/api';
import { photoUrl } from '@/lib/config';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [resendApiKey, setResendApiKey] = useState('');
  const [mailFrom, setMailFrom] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [qrTtl, setQrTtl] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<AppSettings>('/admin/settings')
      .then((s) => {
        setSettings(s);
        setMailFrom(s.mailFrom);
        setGoogleClientId(s.googleClientId ?? '');
        setQrTtl(s.qrTtlSeconds);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити налаштування'),
      );
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const body: Record<string, string> = { mailFrom };
      // Send the key only when the admin typed a new one (empty = leave as is,
      // unless they explicitly want to clear — handled by the Clear button).
      if (resendApiKey) {
        body.resendApiKey = resendApiKey;
      }
      const updated = await api<AppSettings>('/admin/settings', { method: 'PUT', body });
      setSettings(updated);
      setResendApiKey('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveQrTtl(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const value = Math.min(300, Math.max(10, Math.round(qrTtl) || 60));
      const updated = await api<AppSettings>('/admin/settings', {
        method: 'PUT',
        body: { qrTtlSeconds: value },
      });
      setSettings(updated);
      setQrTtl(updated.qrTtlSeconds);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  }

  async function handleClearKey() {
    if (
      !window.confirm('Очистити збережений Resend API key? Листи знову підуть у dev-режим/лог.')
    ) {
      return;
    }
    setError(null);
    try {
      const updated = await api<AppSettings>('/admin/settings', {
        method: 'PUT',
        body: { resendApiKey: '' },
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося очистити');
    }
  }

  async function handleNszhuUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);
    try {
      setSettings(await apiUpload<AppSettings>('/admin/settings/nszhu-logo', 'logo', file));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити логотип');
    }
  }

  async function handleNszhuRemove() {
    if (!window.confirm('Видалити логотип НСЖУ?')) {
      return;
    }
    setError(null);
    try {
      setSettings(await api<AppSettings>('/admin/settings/nszhu-logo', { method: 'DELETE' }));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося видалити');
    }
  }

  async function handleSaveGoogle(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const body: Record<string, string> = { googleClientId };
      if (googleClientSecret) body.googleClientSecret = googleClientSecret;
      const updated = await api<AppSettings>('/admin/settings', { method: 'PUT', body });
      setSettings(updated);
      setGoogleClientId(updated.googleClientId ?? '');
      setGoogleClientSecret('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  }

  async function handleClearGoogle() {
    if (!window.confirm('Очистити Google OAuth ключі? Вхід через Google вимкнеться.')) return;
    setError(null);
    try {
      const updated = await api<AppSettings>('/admin/settings', {
        method: 'PUT',
        body: { googleClientId: '', googleClientSecret: '' },
      });
      setSettings(updated);
      setGoogleClientId('');
      setGoogleClientSecret('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося очистити');
    }
  }

  const nszhuLogo = photoUrl(settings?.nszhuLogoPath ?? null);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold">Налаштування</h1>

      <section className="space-y-3 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">Логотип НСЖУ</h2>
        <p className="text-sm text-slate-500">
          Логотип Національної спілки журналістів України. Відображається на посвідченнях лише тих
          журналістів, у яких відмічено «Член НСЖУ». Додайте його як окреме поле в конструкторі
          дизайну (джерело даних — «Логотип НСЖУ»).
        </p>
        <div className="flex items-center gap-4">
          {nszhuLogo ? (
            <img
              src={nszhuLogo}
              alt="Логотип НСЖУ"
              className="h-16 w-16 rounded object-contain ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
              немає
            </div>
          )}
          <label className="cursor-pointer rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300">
            {nszhuLogo ? 'Замінити' : 'Завантажити'}
            <input
              type="file"
              accept="image/svg+xml,image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={(e) => void handleNszhuUpload(e.target.files?.[0])}
            />
          </label>
          {nszhuLogo && (
            <Button type="button" variant="secondary" onClick={() => void handleNszhuRemove()}>
              Видалити
            </Button>
          )}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">Пошта (Resend)</h2>
        <p className="text-sm text-slate-500">
          API-ключ для надсилання листів із кодом підтвердження. Отримати:{' '}
          <a
            href="https://resend.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 hover:underline"
          >
            resend.com
          </a>
          . Без ключа коди пишуться в лог сервера (dev-режим).
        </p>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Статус:{' '}
          {settings?.resendConfigured ? (
            <span className="font-semibold text-emerald-700">
              налаштовано ({settings.resendKeyPreview})
            </span>
          ) : (
            <span className="font-semibold text-amber-700">не налаштовано — dev-режим</span>
          )}
        </div>

        <Field
          label={settings?.resendConfigured ? 'Новий Resend API key' : 'Resend API key'}
          type="password"
          placeholder="re_..."
          autoComplete="off"
          value={resendApiKey}
          onChange={(e) => setResendApiKey(e.target.value)}
        />
        <Field
          label="Відправник (From)"
          placeholder="PressPass <no-reply@domain.ua>"
          value={mailFrom}
          onChange={(e) => setMailFrom(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">Збережено ✓</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Збереження…' : 'Зберегти'}
          </Button>
          {settings?.resendConfigured && (
            <Button type="button" variant="secondary" onClick={() => void handleClearKey()}>
              Очистити ключ
            </Button>
          )}
        </div>
      </form>

      <form onSubmit={handleSaveQrTtl} className="space-y-4 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">QR-код посвідчення</h2>
        <p className="text-sm text-slate-500">
          Термін дії QR-коду в секундах. Це також інтервал його перегенерації, тож термін дії й
          оновлення збігаються. Діапазон: 10–300 с.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <span className="text-slate-700">Термін дії, с</span>
          <input
            type="number"
            min={10}
            max={300}
            value={qrTtl}
            onChange={(e) => setQrTtl(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 px-2 py-1"
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Збереження…' : 'Зберегти'}
        </Button>
      </form>

      <form onSubmit={handleSaveGoogle} className="space-y-4 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">Вхід через Google (OAuth)</h2>
        <p className="text-sm text-slate-500">
          Client ID і Client Secret з Google Cloud Console. Redirect URI:{' '}
          <code className="rounded bg-slate-100 px-1">
            {'{ваш-домен}'}/api/auth/google/callback
          </code>
          . Секрет зберігається зашифровано.
        </p>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Статус:{' '}
          {settings?.googleConfigured ? (
            <span className="font-semibold text-emerald-700">
              налаштовано ({settings.googleSecretPreview})
            </span>
          ) : (
            <span className="font-semibold text-amber-700">не налаштовано — кнопку приховано</span>
          )}
        </div>

        <Field
          label="Google Client ID"
          placeholder="1234567890-abc.apps.googleusercontent.com"
          autoComplete="off"
          value={googleClientId}
          onChange={(e) => setGoogleClientId(e.target.value)}
        />
        <Field
          label={settings?.googleConfigured ? 'Новий Client Secret' : 'Google Client Secret'}
          type="password"
          placeholder="GOCSPX-..."
          autoComplete="off"
          value={googleClientSecret}
          onChange={(e) => setGoogleClientSecret(e.target.value)}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Збереження…' : 'Зберегти'}
          </Button>
          {settings?.googleConfigured && (
            <Button type="button" variant="secondary" onClick={() => void handleClearGoogle()}>
              Очистити
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
