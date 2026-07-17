'use client';

import { Suspense } from 'react';

import { CardDesigner } from './CardDesigner';

/**
 * Card design admin screen: a drag-and-drop designer where every field is a
 * free-positioned element on a grid. Reached from the Редакції tab per
 * editorial (?editorial=ID); each editorial can have its own design. The logo
 * comes from the editorial's settings; the QR is the live tokenised verify code.
 */
export default function AdminDesignPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Завантаження конструктора…</p>}>
      <CardDesigner />
    </Suspense>
  );
}
