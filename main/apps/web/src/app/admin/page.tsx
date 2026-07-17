'use client';

import type { AdminJournalist, CardResponse } from '@presspass/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/** Admin dashboard: headline numbers and quick links. */
export default function AdminDashboardPage() {
  const [journalists, setJournalists] = useState<AdminJournalist[] | null>(null);
  const [cards, setCards] = useState<CardResponse[] | null>(null);

  useEffect(() => {
    void api<AdminJournalist[]>('/admin/journalists')
      .then(setJournalists)
      .catch(() => undefined);
    void api<CardResponse[]>('/admin/cards')
      .then(setCards)
      .catch(() => undefined);
  }, []);

  const activeCards = cards?.filter((card) => card.status === 'ACTIVE').length;

  const stats = [
    { label: 'Журналістів', value: journalists?.length, href: '/admin/journalists' },
    { label: 'Посвідчень', value: cards?.length, href: '/admin/journalists' },
    { label: 'Дійсних посвідчень', value: activeCards, href: '/admin/journalists' },
  ];

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Огляд</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-xl bg-white p-5 shadow transition-shadow hover:shadow-md"
          >
            <p className="text-3xl font-bold text-blue-700">{stat.value ?? '—'}</p>
            <p className="text-sm text-slate-500">{stat.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
