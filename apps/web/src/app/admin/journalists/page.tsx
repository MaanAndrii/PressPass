'use client';

import { Badge, Button } from '@presspass/ui';
import type { AdminJournalist, Editorial } from '@presspass/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { photoUrl } from '@/lib/config';
import { JournalistDetailModal } from './JournalistDetailModal';
import { JournalistFormModal } from './JournalistFormModal';

/** Fields the free-text filter matches against. */
function matches(j: AdminJournalist, q: string): boolean {
  const haystack = [
    j.publicId,
    j.fullName,
    j.fullNameEn,
    j.email,
    j.phone,
    j.taxNumber,
    j.passportData,
    j.birthDate,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q.toLowerCase().trim());
}

export default function AdminJournalistsPage() {
  const isSuperAdmin = getStoredUser()?.role === 'ADMIN';
  const [journalists, setJournalists] = useState<AdminJournalist[]>([]);
  const [editorials, setEditorials] = useState<Editorial[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Modal state: which journalist is open in detail, and the create/edit form.
  const [selected, setSelected] = useState<AdminJournalist | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminJournalist | null>(null);
  // "Add by public id" bar.
  const [attachId, setAttachId] = useState('');
  const [attachEditorialId, setAttachEditorialId] = useState('');
  const [attachMsg, setAttachMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api<AdminJournalist[]>('/admin/journalists');
      setJournalists(list);
      // Keep the open detail modal in sync after changes.
      setSelected((cur) => (cur ? (list.find((j) => j.id === cur.id) ?? null) : null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити список');
    }
  }, []);

  useEffect(() => {
    void reload();
    void api<Editorial[]>('/admin/editorials')
      .then((list) => {
        setEditorials(list);
        if (list.length === 1 && list[0]) {
          setAttachEditorialId(String(list[0].id));
        }
      })
      .catch(() => setEditorials([]));
  }, [reload]);

  async function handleAttach() {
    setAttachMsg(null);
    setError(null);
    const body: Record<string, string | number> = { publicId: attachId.trim() };
    if (isSuperAdmin && attachEditorialId) {
      body.editorialId = Number(attachEditorialId);
    }
    try {
      const j = await api<AdminJournalist>('/admin/journalists/attach', { method: 'POST', body });
      setAttachId('');
      setAttachMsg(`Додано: ${j.fullName || j.email}`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося додати журналіста');
    }
  }

  const filtered = useMemo(
    () => (query.trim() ? journalists.filter((j) => matches(j, query)) : journalists),
    [journalists, query],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(j: AdminJournalist) {
    setEditing(j);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Журналісти</h1>
        <input
          type="search"
          placeholder="Пошук за ПІБ, email, ІПН…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
        />
        <Button onClick={openCreate}>Створити</Button>
      </div>

      {/* Додати наявного журналіста за його унікальним ID */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 shadow">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Додати журналіста за ID
          </label>
          <input
            value={attachId}
            onChange={(e) => setAttachId(e.target.value)}
            placeholder="JR-XXXXXX"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase focus:border-blue-500 focus:outline-none"
          />
        </div>
        {isSuperAdmin && (
          <select
            value={attachEditorialId}
            onChange={(e) => setAttachEditorialId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">— редакція —</option>
            {editorials.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayNameUk || e.name}
              </option>
            ))}
          </select>
        )}
        <Button onClick={() => void handleAttach()} disabled={!attachId.trim()}>
          Додати
        </Button>
      </div>
      {attachMsg && <p className="text-sm text-emerald-600">{attachMsg}</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Фото</th>
              <th className="px-4 py-3">ПІБ</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Посвідчень</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <tr
                key={j.id}
                onClick={() => !j.encrypted && setSelected(j)}
                className={`border-b border-slate-100 ${
                  j.encrypted ? 'opacity-70' : 'cursor-pointer hover:bg-slate-50'
                }`}
              >
                <td className="px-4 py-2">
                  {photoUrl(j.photoPath) ? (
                    <img
                      src={photoUrl(j.photoPath)!}
                      alt={`Фото: ${j.fullName}`}
                      className="h-12 w-9 rounded object-cover"
                    />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {j.encrypted ? (
                    <p
                      className="font-medium italic text-slate-400"
                      title="Самозареєстрований журналіст без членства у вашій редакції — його дані зашифровані та недоступні"
                    >
                      🔒 Немає доступу
                    </p>
                  ) : (
                    <>
                      <p className="font-medium">
                        {j.fullName || (
                          <span className="italic text-slate-400">(без імені — реєстрація)</span>
                        )}
                      </p>
                      {j.fullNameEn && <p className="text-xs text-slate-400">{j.fullNameEn}</p>}
                    </>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{j.publicId}</td>
                <td className="px-4 py-2">{j.email}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-start gap-1">
                    {j.emailVerified ? (
                      <Badge tone="success">Email ✓</Badge>
                    ) : (
                      <Badge tone="warning">Email ✗</Badge>
                    )}
                    {j.selfRegistered && !j.profileComplete && (
                      <Badge tone="warning">Анкета ✗</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">{j.cardsCount}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {query.trim() ? 'Нічого не знайдено' : 'Журналістів ще немає'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <JournalistDetailModal
        journalist={selected}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onChanged={() => void reload()}
      />

      <JournalistFormModal
        open={formOpen}
        journalist={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </div>
  );
}
