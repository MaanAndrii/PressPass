import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared shell for the public legal pages (privacy policy, terms of service).
 * Plain, readable typography with a back-to-home link — no auth required, so
 * the URLs stay valid for the Google OAuth consent screen and external review.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 text-sm">
        <Link href="/" className="text-slate-500 hover:underline">
          ← На головну
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-blue-700">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Оновлено: {updated}</p>
      <div className="legal mt-8 space-y-5 text-slate-700">{children}</div>
      <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-400">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/privacy" className="hover:underline">
            Політика конфіденційності
          </Link>
          <Link href="/terms" className="hover:underline">
            Умови використання
          </Link>
        </div>
      </footer>
    </main>
  );
}

/** A numbered section with a heading, used to structure the legal text. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 mt-6 text-lg font-semibold text-slate-800">{heading}</h2>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}
