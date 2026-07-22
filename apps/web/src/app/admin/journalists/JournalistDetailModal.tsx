'use client';

import { Badge, Button, Field, Modal } from '@presspass/ui';
import type { AdminJournalist, CardQr, CardResponse, Editorial, Position } from '@presspass/shared';
import { useCallback, useEffect, useState } from 'react';

import { StatusBadge } from '@/components/StatusBadge';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { photoUrl } from '@/lib/config';

/**
 * Journalist detail modal: profile, photo upload, cards management
 * (issue / renew / block / open verify) and edit/delete actions.
 */
export function JournalistDetailModal({
  journalist,
  onClose,
  onEdit,
  onChanged,
  onRemoved,
}: {
  journalist: AdminJournalist | null;
  onClose: () => void;
  onEdit: (j: AdminJournalist) => void;
  onChanged: () => void;
  /** Called after a (soft) removal so the page can offer a quick undo. */
  onRemoved?: (j: AdminJournalist, kind: 'membership' | 'account') => void;
}) {
  const isSuperAdmin = getStoredUser()?.role === 'ADMIN';
  const [cards, setCards] = useState<CardResponse[]>([]);
  const [editorials, setEditorials] = useState<Editorial[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [editorialId, setEditorialId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [expireDate, setExpireDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCards = useCallback(async () => {
    if (!journalist) {
      return;
    }
    try {
      const all = await api<CardResponse[]>('/admin/cards');
      setCards(all.filter((c) => c.journalist.id === journalist.id));
    } catch {
      setCards([]);
    }
  }, [journalist]);

  useEffect(() => {
    setError(null);
    setExpireDate('');
    setEditorialId('');
    setPositionId('');
    void loadCards();
    void api<Editorial[]>('/admin/editorials')
      .then((list) => {
        setEditorials(list);
        // An editorial admin is bound to a single editorial — preselect it.
        if (list.length === 1 && list[0]) {
          setEditorialId(String(list[0].id));
        }
      })
      .catch(() => setEditorials([]));
    void api<Position[]>('/admin/positions')
      .then(setPositions)
      .catch(() => setPositions([]));
  }, [loadCards]);

  if (!journalist) {
    return null;
  }

  async function action<T>(fn: () => Promise<T>, fail: string) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await loadCards();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fail);
    } finally {
      setBusy(false);
    }
  }

  const j = journalist;
  const photo = photoUrl(j.photoPath);

  return (
    <Modal
      open
      onClose={onClose}
      title={j.fullName || 'Журналіст (без імені)'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onEdit(j)}>
            Редагувати
          </Button>
          {!isSuperAdmin && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Прибрати журналіста зі своєї редакції? Спершу мають бути скасовані (заблоковані) його активні посвідчення. Дію можна відмінити.',
                  )
                ) {
                  void action(
                    () =>
                      api(`/admin/journalists/${j.id}/membership`, { method: 'DELETE' }).then(
                        () => {
                          onRemoved?.(j, 'membership');
                          onClose();
                        },
                      ),
                    'Не вдалося прибрати з редакції',
                  );
                }
              }}
            >
              Прибрати з редакції
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Видалити журналіста? Акаунт і посвідчення приховуються та зберігаються 7 днів — за цей час видалення можна відмінити, потім усе стирається остаточно.',
                  )
                ) {
                  void action(
                    () =>
                      api(`/admin/journalists/${j.id}`, { method: 'DELETE' }).then(() => {
                        onRemoved?.(j, 'account');
                        onClose();
                      }),
                    'Помилка видалення',
                  );
                }
              }}
            >
              Видалити
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Профіль */}
        <div className="flex gap-4">
          {photo ? (
            <img
              src={photo}
              alt={`Фото: ${j.fullName}`}
              className="h-28 w-21 rounded-lg object-cover ring-1 ring-slate-200"
              style={{ width: '5.25rem' }}
            />
          ) : (
            <div
              className="flex h-28 items-center justify-center rounded-lg bg-slate-200 text-3xl text-slate-400"
              style={{ width: '5.25rem' }}
            >
              👤
            </div>
          )}
          <dl className="flex-1 space-y-1 text-sm">
            <Row label="ID" value={j.publicId} />
            <Row label="Email" value={j.email} />
            {j.fullNameEn && <Row label="Латиницею" value={j.fullNameEn} />}
            {j.birthDate && <Row label="Народження" value={j.birthDate} />}
            {j.phone && <Row label="Телефон" value={j.phone} />}
            {j.taxNumber && <Row label="ІПН" value={j.taxNumber} />}
            {j.passportData && <Row label="Паспорт" value={j.passportData} />}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {j.emailVerified ? (
            <Badge tone="success">Email ✓</Badge>
          ) : (
            <Badge tone="warning">Email не підтверджено</Badge>
          )}
          {j.selfRegistered &&
            (j.profileComplete ? (
              <Badge tone="success">Анкета ✓</Badge>
            ) : (
              <Badge tone="warning">Анкета не заповнена</Badge>
            ))}
          {j.nszhuMember && <Badge tone="info">Член НСЖУ</Badge>}
          {j.memberships.map((m) => (
            <Badge key={m.id} tone="neutral">
              {m.name}
            </Badge>
          ))}
        </div>

        {/* Посвідчення */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Посвідчення</h3>
          <div className="space-y-2">
            {cards.map((card) => (
              <div
                key={card.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm"
              >
                <span className="font-mono">{card.cardNumber}</span>
                <StatusBadge status={card.status} />
                {card.editorial && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    {card.editorial.displayNameUk || card.editorial.name}
                    {card.position ? ` · ${card.position}` : ''}
                  </span>
                )}
                <span className="text-slate-400">до {card.expireDate}</span>
                <div className="ml-auto flex gap-1">
                  <button
                    className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                    onClick={() =>
                      void action(async () => {
                        const qr = await api<CardQr>(`/admin/cards/${card.id}/qr`);
                        window.open(qr.verifyUrl, '_blank', 'noopener');
                      }, 'Помилка перевірки')
                    }
                  >
                    Перевірка
                  </button>
                  <button
                    className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                    onClick={() => {
                      const d = window.prompt(
                        'Нова дата завершення (РРРР-ММ-ДД):',
                        card.expireDate,
                      );
                      if (d) {
                        void action(
                          () =>
                            api('/admin/cards/renew', {
                              method: 'POST',
                              body: { cardId: card.id, expireDate: d },
                            }),
                          'Помилка продовження',
                        );
                      }
                    }}
                  >
                    Продовжити
                  </button>
                  {card.status !== 'BLOCKED' && (
                    <button
                      className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                      onClick={() => {
                        if (window.confirm('Заблокувати посвідчення?')) {
                          void action(
                            () =>
                              api('/admin/cards/block', {
                                method: 'POST',
                                body: { cardId: card.id },
                              }),
                            'Помилка блокування',
                          );
                        }
                      }}
                    >
                      Заблокувати
                    </button>
                  )}
                  <button
                    className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                    onClick={() => {
                      if (window.confirm('Видалити посвідчення без можливості відновлення?')) {
                        void action(
                          () => api(`/admin/cards/${card.id}`, { method: 'DELETE' }),
                          'Помилка видалення',
                        );
                      }
                    }}
                  >
                    Видалити
                  </button>
                </div>
              </div>
            ))}
            {cards.length === 0 && <p className="text-sm text-slate-400">Посвідчень ще немає.</p>}
          </div>

          {/* Видати нове */}
          <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Видати посвідчення</p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Редакція <span className="text-red-500">*</span>
              </span>
              <select
                value={editorialId}
                onChange={(e) => setEditorialId(e.target.value)}
                disabled={!isSuperAdmin}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
              >
                <option value="">— виберіть редакцію —</option>
                {editorials.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.displayNameUk || e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Посада <span className="text-red-500">*</span>
              </span>
              <select
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">— вибрати зі списку —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameUk}
                    {p.nameEn ? ` / ${p.nameEn}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  label="Дійсне до"
                  type="date"
                  value={expireDate}
                  onChange={(e) => setExpireDate(e.target.value)}
                />
              </div>
              <Button
                disabled={busy || !expireDate || !editorialId || !positionId}
                onClick={() =>
                  void action(async () => {
                    const p = positions.find((x) => String(x.id) === positionId);
                    if (!p) {
                      throw new Error('Виберіть посаду');
                    }
                    await api('/admin/cards', {
                      method: 'POST',
                      body: {
                        journalistId: j.id,
                        editorialId: Number(editorialId),
                        position: p.nameUk,
                        positionEn: p.nameEn,
                        expireDate,
                      },
                    });
                    setExpireDate('');
                    setPositionId('');
                    if (isSuperAdmin) {
                      setEditorialId('');
                    }
                  }, 'Помилка видачі')
                }
              >
                Видати
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Редакція, від імені якої видається посвідчення, задає посаду. Для самореєстрації
            потрібна повна анкета журналіста.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 flex-shrink-0 text-xs uppercase text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
