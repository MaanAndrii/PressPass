'use client';

import { Button } from '@presspass/ui';
import type { Editorial } from '@presspass/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { photoUrl } from '@/lib/config';
import { EditorialFormModal } from './EditorialFormModal';

/**
 * Довідник редакцій (компаній-емітентів). Адміністратор створює тут компанії,
 * від імені яких видаються посвідчення; логотип редакції потрапляє на картку.
 */
export default function AdminEditorialsPage() {
  const isSuperAdmin = getStoredUser()?.role === 'ADMIN';
  const [editorials, setEditorials] = useState<Editorial[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Editorial | null>(null);

  const reload = useCallback(async () => {
    try {
      setEditorials(await api<Editorial[]>('/admin/editorials'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити список');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(e: Editorial) {
    setEditing(e);
    setFormOpen(true);
  }

  async function remove(e: Editorial) {
    if (!window.confirm(`Видалити редакцію «${e.name}»? Видані посвідчення залишаться.`)) {
      return;
    }
    try {
      await api(`/admin/editorials/${e.id}`, { method: 'DELETE' });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Помилка видалення');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{isSuperAdmin ? 'Редакції' : 'Моя редакція'}</h1>
        <p className="min-w-0 flex-1 text-sm text-slate-500">
          Компанії, від імені яких видаються посвідчення.
        </p>
        {isSuperAdmin && <Button onClick={openCreate}>Створити</Button>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Логотип</th>
              <th className="px-4 py-3">Назва</th>
              <th className="px-4 py-3">ЄДРПОУ</th>
              <th className="px-4 py-3">Директор</th>
              <th className="px-4 py-3">Контакти</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {editorials.map((e) => (
              <tr
                key={e.id}
                onClick={() => openEdit(e)}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-2">
                  {photoUrl(e.logoPath) ? (
                    <img
                      src={photoUrl(e.logoPath)!}
                      alt={`Логотип: ${e.name}`}
                      className="h-10 w-10 rounded object-contain"
                    />
                  ) : (
                    <span className="text-2xl text-slate-300">🏢</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <p className="font-medium">{e.name}</p>
                  {e.mediaId && (
                    <p className="font-mono text-xs text-slate-500">
                      Ідентифікатор медіа {e.mediaId}
                    </p>
                  )}
                  {e.website && (
                    <a
                      href={e.website}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {e.website}
                    </a>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{e.edrpou || '—'}</td>
                <td className="px-4 py-2">{e.director || '—'}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {e.email && <div>{e.email}</div>}
                  {e.phone && <div>{e.phone}</div>}
                  {!e.email && !e.phone && '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Link
                      href={`/admin/design?editorial=${e.id}`}
                      onClick={(ev) => ev.stopPropagation()}
                      className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                    >
                      Дизайн
                    </Link>
                    {isSuperAdmin && (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void remove(e);
                        }}
                        className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                      >
                        Видалити
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {editorials.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Редакцій ще немає — створіть першу.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditorialFormModal
        open={formOpen}
        editorial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </div>
  );
}
