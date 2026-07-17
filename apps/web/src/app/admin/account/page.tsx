'use client';

import { Button, Field } from '@presspass/ui';
import { type FormEvent, useState } from 'react';

import { api, ApiError } from '@/lib/api';

/** Account settings available to every admin: change your own password. */
export default function AdminAccountPage() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

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
    </div>
  );
}
