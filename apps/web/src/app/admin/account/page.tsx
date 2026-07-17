'use client';

import { Button, Field } from '@presspass/ui';
import { type FormEvent, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { EncryptionCredentialInput } from '@/components/EncryptionCredentialInput';
import { downloadKeyfile, generateKeyfileSecret } from '@/lib/keyfile';

/** Account settings available to every admin: change your own password. */
export default function AdminAccountPage() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Encryption credential: switch from a passphrase to a generated key-file.
  const [currentCred, setCurrentCred] = useState('');
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const [cryptoMsg, setCryptoMsg] = useState<string | null>(null);
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  async function switchToKeyfile() {
    setCryptoError(null);
    setCryptoMsg(null);
    if (currentCred.length < 12) {
      setCryptoError('Вкажіть поточну крипто-фразу або ключ-файл');
      return;
    }
    setCryptoBusy(true);
    try {
      const secret = generateKeyfileSecret();
      await api('/encryption/change-passphrase', {
        method: 'POST',
        body: { currentPassphrase: currentCred, newPassphrase: secret },
      });
      downloadKeyfile(secret, 'presspass-admin.key');
      setCurrentCred('');
      setCryptoMsg(
        'Готово — новий ключ-файл завантажено. Зберігайте його надійно й входьте ним наступного разу. Поточну сесію шифрування скинуто.',
      );
    } catch (err) {
      setCryptoError(err instanceof ApiError ? err.message : 'Не вдалося змінити крипто-доступ');
    } finally {
      setCryptoBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (form.next.length < 8) {
      setError('Новий пароль має містити щонайменше 8 символів');
      return;
    }
    if (form.next !== form.confirm) {
      setError('Паролі не збігаються');
      return;
    }
    setBusy(true);
    try {
      await api('/me/password', {
        method: 'PUT',
        body: { currentPassword: form.current, newPassword: form.next },
      });
      setForm({ current: '', next: '', confirm: '' });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося змінити пароль');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-bold">Обліковий запис</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">Зміна пароля</h2>
        <Field
          label="Поточний пароль"
          type="password"
          required
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })}
        />
        <Field
          label="Новий пароль (мін. 8 символів)"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.next}
          onChange={(e) => setForm({ ...form, next: e.target.value })}
        />
        <Field
          label="Повторіть новий пароль"
          type="password"
          required
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">Пароль змінено ✓</p>}

        <Button type="submit" disabled={busy}>
          {busy ? 'Збереження…' : 'Змінити пароль'}
        </Button>
      </form>

      <section className="space-y-4 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">Крипто-доступ: перейти на ключ-файл</h2>
        <p className="text-sm text-slate-600">
          Замість того щоб памʼятати крипто-фразу, можна користуватися ключ-файлом. Файл
          згенерується і завантажиться — зберігайте його надійно (USB, сейф, менеджер паролів).
          Втрата файлу = блокування; відновлення лише через recovery-кіт суперадміна.
        </p>
        <EncryptionCredentialInput
          label="Поточна крипто-фраза або ключ-файл"
          value={currentCred}
          onChange={setCurrentCred}
        />
        {cryptoError && <p className="text-sm text-red-600">{cryptoError}</p>}
        {cryptoMsg && <p className="text-sm text-emerald-600">{cryptoMsg}</p>}
        <Button type="button" onClick={() => void switchToKeyfile()} disabled={cryptoBusy}>
          {cryptoBusy ? 'Застосування…' : 'Згенерувати ключ-файл і застосувати'}
        </Button>
      </section>
    </div>
  );
}
