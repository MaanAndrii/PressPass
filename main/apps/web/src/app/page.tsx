'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isAdminRole, type Role } from '@presspass/shared';

import { getStoredUser, getToken } from '@/lib/auth';

/**
 * Головна сторінка платформи. Показує, що це за сервіс, і веде далі:
 * гостя — на вхід, журналіста — до посвідчення, адміністратора — в панель.
 */
export default function HomePage() {
  const [session, setSession] = useState<{ role: Role } | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (getToken() && user) {
      setSession({ role: user.role });
    }
  }, []);

  const primaryAction = session
    ? isAdminRole(session.role)
      ? { href: '/admin', label: 'Панель адміністратора' }
      : { href: '/card', label: 'Моє посвідчення' }
    : { href: '/login', label: 'Увійти' };

  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-blue-700 text-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-14 text-center">
          {/* Логотип платформи */}
          <img src="/icons/logo.png" alt="Логотип PressPass" className="mb-5 h-20 w-20" />
          <h1 className="text-4xl font-extrabold tracking-tight">PressPass</h1>
          <p className="mt-3 max-w-xl text-lg text-blue-100">
            Електронні посвідчення журналістів: видача, адміністрування та миттєва перевірка за
            QR-кодом
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={primaryAction.href}
              className="rounded-xl bg-white px-8 py-3 text-base font-semibold text-blue-700 shadow-lg transition hover:bg-blue-50"
            >
              {primaryAction.label}
            </Link>
            {!session && (
              <Link
                href="/register"
                className="rounded-xl border-2 border-white/60 px-8 py-3 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Реєстрація
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-3xl">🪪</p>
          <h2 className="mt-2 font-semibold">Цифрове посвідчення</h2>
          <p className="mt-1 text-sm text-slate-500">
            Завжди з собою у смартфоні. Встановлюється на головний екран і працює навіть без
            інтернету.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-3xl">📷</p>
          <h2 className="mt-2 font-semibold">Перевірка за QR</h2>
          <p className="mt-1 text-sm text-slate-500">
            Будь-хто може відсканувати QR-код на посвідченні та миттєво переконатися, що воно
            дійсне.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-3xl">🛡️</p>
          <h2 className="mt-2 font-semibold">Захист даних</h2>
          <p className="mt-1 text-sm text-slate-500">
            QR-код не містить персональних даних — лише захищене посилання на сторінку перевірки.
          </p>
        </div>
      </section>

      <footer className="mt-auto py-6 text-center text-xs text-slate-400">
        PressPass Platform — електронні посвідчення журналістів
      </footer>
    </main>
  );
}
