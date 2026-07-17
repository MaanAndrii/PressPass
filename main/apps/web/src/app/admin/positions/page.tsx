'use client';

import { Button, Field } from '@presspass/ui';
import type { Position } from '@presspass/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';

/**
 * Довідник посад (укр./англ.), які вибираються зі списку при видачі
 * посвідчення. Керує лише системний адміністратор. Посаду можна редагувати;
 * видалення заборонене, якщо посада вже використовується посвідченнями.
 */
export default function AdminPositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [form, setForm] = useState({ nameUk: '', nameEn: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPositions(await api<Position[]>('/admin/positions'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити список');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startEdit(p: Position) {
    setEditingId(p.id);
    setForm({ nameUk: p.nameUk, nameEn: p.nameEn });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ nameUk: '', nameEn: '' });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const body = { nameUk: form.nameUk.trim(), nameEn: form.nameEn.trim() };
    try {
      if (editingId) {
        await api(`/admin/positions/${editingId}`, { method: 'PUT', body });
      } else {
        await api('/admin/positions', { method: 'POST', body });
      }
      cancelEdit();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося зберегти посаду');
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Position) {
    if (!window.confirm(`Видалити посаду «${p.nameUk}»? Дію не можна скасувати.`)) {
      return;
    }
    setError(null);
    try {
      await api(`/admin/positions/${p.id}`, { method: 'DELETE' });
      if (editingId === p.id) {
        cancelEdit();
      }
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Помилка видалення');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Посади</h1>

      <section className="space-y-2 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">Довідник посад</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="divide-y divide-slate-100">
          {positions.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-slate-800">{p.nameUk}</span>
                {p.nameEn && <span className="text-slate-400"> · {p.nameEn}</span>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => startEdit(p)}
                  className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
                >
                  Редагувати
                </button>
                <button
                  onClick={() => void remove(p)}
                  className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                >
                  Видалити
                </button>
              </div>
            </li>
          ))}
          {positions.length === 0 && (
            <li className="py-2 text-sm text-slate-400">Список порожній.</li>
          )}
        </ul>
      </section>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow">
        <h2 className="font-semibold">{editingId ? 'Редагувати посаду' : 'Додати посаду'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Назва (укр.)"
            required
            value={form.nameUk}
            onChange={(e) => setForm({ ...form, nameUk: e.target.value })}
          />
          <Field
            label="Назва (англ.)"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !form.nameUk.trim()}>
            {busy ? 'Збереження…' : editingId ? 'Зберегти' : 'Додати'}
          </Button>
          {editingId && (
            <Button type="button" variant="secondary" onClick={cancelEdit}>
              Скасувати
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
