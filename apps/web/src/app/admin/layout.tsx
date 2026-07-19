'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { clearSession, getStoredUser, getToken, getUnlockToken } from '@/lib/auth';

/** Nav items; `superOnly` are hidden from editorial-bound admins. */
const NAV_ITEMS = [
  { href: '/admin', label: 'Огляд' },
  { href: '/admin/journalists', label: 'Журналісти' },
  { href: '/admin/editorials', label: 'Редакції' },
  { href: '/admin/positions', label: 'Посади', superOnly: true },
  { href: '/admin/admins', label: 'Адміністратори', superOnly: true },
  { href: '/admin/settings', label: 'Налаштування', superOnly: true },
  { href: '/admin/account', label: 'Обліковий запис' },
];

/** Admin area shell: role check + navigation. Admin UI lives at /admin (SRS §5). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!getToken() || (user?.role !== 'ADMIN' && user?.role !== 'EDITORIAL_ADMIN')) {
      router.replace('/login');
      return;
    }
    // The admin area is only meaningful with an unlocked encryption session:
    // without it every data call is rejected and rows come back redacted. Send
    // the admin to unlock first (returning here afterwards) instead of showing
    // an empty panel that looks like it was reached without unlocking.
    if (!getUnlockToken()) {
      router.replace(`/encryption?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setIsSuperAdmin(user.role === 'ADMIN');
    setAuthorized(true);
  }, [router, pathname]);

  function handleLogout() {
    void api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
    router.replace('/');
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Перевірка доступу…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-blue-700 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold">PressPass Admin</span>
            <nav className="flex gap-4 text-sm">
              {NAV_ITEMS.filter((item) => isSuperAdmin || !item.superOnly).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded px-2 py-1 hover:bg-blue-600 ${
                    pathname === item.href ? 'bg-blue-800 font-semibold' : ''
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <button onClick={handleLogout} className="text-sm text-blue-200 hover:text-white">
            Вийти
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
