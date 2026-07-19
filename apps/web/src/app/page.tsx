'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isAdminRole, type Role } from '@presspass/shared';

import { getStoredUser, getToken } from '@/lib/auth';

// Prose is kept in string constants so Prettier never fill-wraps the (Cyrillic)
// text across lines — that wrapping proved environment-sensitive between Node
// versions and intermittently broke the CI formatting check.
const HERO_UK =
  'PressPass — платформа для видачі, адміністрування та перевірки електронних посвідчень журналістів.';
const HERO_EN =
  'PressPass is a web application for issuing, managing and verifying digital press credentials for journalists.';
const ABOUT_UK =
  ' — це вебзастосунок для редакцій та журналістів. Редакції створюють і видають своїм журналістам електронні посвідчення, журналісти зберігають їх у смартфоні як застосунок на головному екрані, а будь-хто може миттєво перевірити дійсність посвідчення, відсканувавши QR-код. Увійти можна за електронною поштою та паролем або через обліковий запис Google; дані облікового запису Google використовуються виключно для входу до PressPass.';
const ABOUT_EN =
  ' helps newsrooms issue digital press credentials to their journalists, lets journalists carry those credentials on their phone, and lets anyone verify a credential instantly by scanning its QR code. You can sign in with an email and password or with your Google account; Google account data is used only to sign you in to PressPass.';
const FEATURE_DIGITAL =
  'Завжди з собою у смартфоні. Встановлюється на головний екран і працює навіть без інтернету.';
const FEATURE_QR =
  'Будь-хто може відсканувати QR-код на посвідченні та миттєво переконатися, що воно дійсне.';
const FEATURE_PRIVACY =
  'QR-код не містить персональних даних — лише захищене посилання на сторінку перевірки.';

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
          <p className="mt-3 max-w-xl text-lg text-blue-100">{HERO_UK}</p>
          <p className="mt-2 max-w-xl text-sm text-blue-200">{HERO_EN}</p>
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

      <section className="mx-auto w-full max-w-3xl px-4 pt-10">
        <h2 className="text-xl font-bold text-slate-800">Про застосунок</h2>
        <p className="mt-3 text-slate-600">
          <strong>PressPass</strong>
          {ABOUT_UK}
        </p>
        <p className="mt-3 text-sm text-slate-500">
          <strong>PressPass</strong>
          {ABOUT_EN}
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-3xl">🪪</p>
          <h2 className="mt-2 font-semibold">Цифрове посвідчення</h2>
          <p className="mt-1 text-sm text-slate-500">{FEATURE_DIGITAL}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-3xl">📷</p>
          <h2 className="mt-2 font-semibold">Перевірка за QR</h2>
          <p className="mt-1 text-sm text-slate-500">{FEATURE_QR}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-3xl">🛡️</p>
          <h2 className="mt-2 font-semibold">Захист даних</h2>
          <p className="mt-1 text-sm text-slate-500">{FEATURE_PRIVACY}</p>
        </div>
      </section>

      <footer className="mt-auto py-6 text-center text-xs text-slate-400">
        <p>PressPass Platform — електронні посвідчення журналістів</p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/privacy" className="hover:underline">
            Політика конфіденційності
          </Link>
          <Link href="/terms" className="hover:underline">
            Умови використання
          </Link>
        </p>
      </footer>
    </main>
  );
}
