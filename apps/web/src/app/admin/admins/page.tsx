'use client';

import { Button, Field } from '@presspass/ui';
import type { AdminAccount, Editorial } from '@presspass/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

/**
 * Керування адміністраторами (лише для системного адміністратора).
 * Системний адмін створює/видаляє як редакційних, так і системних
 * адміністраторів (не можна видалити себе або останнього системного).
 */
export default function AdminAdminsPage() {
  const currentUserId = getStoredUser()?.id;
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [editorials, setEditorials] = useState<Editorial[]>([]);
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'EDITORIAL_ADMIN' as 'ADMIN' | 'EDITORIAL_ADMIN',
    editorialId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setAdmins(await api<AdminAccount[]>('/admin/admins'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити список');
    }
  }, []);

  useEffect(() => {
    void reload();
    void api<Editorial[]>('/admin/editorials')
      .then(setEditorials)
      .catch(() => setEditorials([]));
  }, [reload]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api('/admin/admins', {
        method: 'POST',
        body: {
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          ...(form.role === 'EDITORIAL_ADMIN' ? { editorialId: Number(form.editorialId) } : {}),
        },
      });
      setForm({ email: '', password: '', role: 'EDITORIAL_ADMIN', editorialId: '' });
      setSaved(true);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося створити адміністратора');
    } finally {
      setBusy(false);
    }
  }

  async function remove(admin: AdminAccount) {
    const kind = admin.role === 'ADMIN' ? 'системного' : 'редакційного';
    if (!window.confirm(`Видалити ${kind} адміністратора ${admin.email}?`)) {
      return;
    }
    try {
      await api(`/admin/admins/${admin.id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Помилка видалення');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Адміністратори</h1>

      <section className="space-y-3 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">Облікові записи</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="divide-y divide-slate-100">
          {admins.map((admin) => (
            <li key={admin.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{admin.email}</p>
                <p className="text-xs text-slate-400">
                  {admin.role === 'ADMIN'
                    ? 'Системний адміністратор'
                    : `Редакція: ${admin.editorialName ?? '—'}`}
                </p>
              </div>
              {admin.id !== currentUserId && (
                <button
                  onClick={() => void remove(admin)}
                  className="shrink-0 rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                >
                  Видалити
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400">
          Не можна видалити власний обліковий запис або останнього системного адміністратора.
        </p>
      </section>

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-xl bg-white p-5 shadow"
        autoComplete="off"
      >
        <h2 className="font-semibold">Додати адміністратора</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Тип</span>
          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as 'ADMIN' | 'EDITORIAL_ADMIN' })
            }
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="EDITORIAL_ADMIN">Редакційний (прив'язаний до редакції)</option>
            <option value="ADMIN">Системний (повний доступ)</option>
          </select>
        </label>
        <Field
          label="Email"
          type="email"
          required
          autoComplete="off"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          label="Пароль"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {form.role === 'EDITORIAL_ADMIN' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Редакція</span>
            <select
              required
              value={form.editorialId}
              onChange={(e) => setForm({ ...form, editorialId: e.target.value })}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">— виберіть редакцію —</option>
              {editorials.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayNameUk || e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {saved && <p className="text-sm text-emerald-600">Адміністратора створено ✓</p>}
        <Button
          type="submit"
          disabled={busy || (form.role === 'EDITORIAL_ADMIN' && !form.editorialId)}
        >
          {busy ? 'Створення…' : 'Створити'}
        </Button>
      </form>
    </div>
  );
}
