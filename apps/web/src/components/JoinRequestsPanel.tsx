'use client';

import { Button } from '@presspass/ui';
import type { JoinRequestInfo } from '@presspass/shared';
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';

/**
 * Pending editorial join requests for the signed-in journalist to confirm or
 * reject. Renders nothing when there are none.
 */
export function JoinRequestsPanel() {
  const [requests, setRequests] = useState<JoinRequestInfo[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRequests(await api<JoinRequestInfo[]>('/me/join-requests'));
    } catch {
      // A missing unlock or transient error just leaves the panel empty.
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function respond(id: number, accept: boolean) {
    setBusyId(id);
    setError(null);
    try {
      setRequests(
        await api<JoinRequestInfo[]>(`/me/join-requests/${id}/${accept ? 'accept' : 'reject'}`, {
          method: 'POST',
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося обробити запит');
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">Запити на приєднання до редакції</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-2">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 shadow-sm"
          >
            <span className="text-sm">
              <b>{request.editorialName}</b> запрошує вас приєднатися до редакції.
            </span>
            <div className="flex gap-2">
              <Button
                onClick={() => void respond(request.id, true)}
                disabled={busyId === request.id}
              >
                Підтвердити
              </Button>
              <button
                type="button"
                onClick={() => void respond(request.id, false)}
                disabled={busyId === request.id}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Відхилити
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
