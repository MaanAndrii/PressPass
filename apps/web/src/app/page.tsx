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

// Шість карток-переваг: три наявні + три нові.
const FEATURES = [
  {
    emoji: '🪪',
    title: 'Цифрове посвідчення',
    text: 'Завжди з собою у смартфоні. Встановлюється на головний екран і працює навіть без інтернету.',
  },
  {
    emoji: '📷',
    title: 'Перевірка за QR',
    text: 'Будь-хто може відсканувати QR-код на посвідченні та миттєво переконатися, що воно дійсне.',
  },
  {
    emoji: '🛡️',
    title: 'Захист даних',
    text: 'QR-код не містить персональних даних — лише захищене посилання на сторінку перевірки.',
  },
  {
    emoji: '🌐',
    title: 'Двомовне посвідчення',
    text: 'Українською та англійською — посвідчення готове показати як удома, так і за кордоном.',
  },
  {
    emoji: '🏢',
    title: 'Для редакцій',
    text: 'Редакція створює, видає та за потреби блокує посвідчення своїх журналістів у зручній панелі.',
  },
  {
    emoji: '🔒',
    title: 'Зашифровані дані',
    text: 'Персональні дані зберігаються зашифрованими — навіть копія бази даних не розкриває їх.',
  },
] as const;

// Слайди для макета телефона (плейсхолдери, без справжніх скріншотів).
const SLIDES = [
  { emoji: '🔐', title: 'Вхід', caption: 'Увійдіть за email/паролем або через Google' },
  { emoji: '🪪', title: 'Моє посвідчення', caption: 'Завжди у смартфоні, працює офлайн' },
  { emoji: '📷', title: 'Перевірка за QR', caption: 'Будь-хто миттєво перевірить дійсність' },
] as const;

/** Макет телефона зі слайдшоу екранів застосунку (ілюстративні плейсхолдери). */
function PhoneSlideshow() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrent((c) => (c + 1) % SLIDES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div className="relative mx-auto aspect-9/19 w-full max-w-[260px] rounded-[2.5rem] border-8 border-slate-800 bg-slate-800 shadow-2xl">
        {/* Виріз («чубчик») зверху */}
        <div className="absolute top-0 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-800" />
        <div className="relative h-full w-full overflow-hidden rounded-[1.9rem] bg-white">
          {SLIDES.map((slide, i) => (
            <div
              key={slide.title}
              className={`absolute inset-0 flex flex-col transition-opacity duration-700 ${
                i === current ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden={i !== current}
            >
              <div className="bg-blue-700 px-4 py-3 text-center text-sm font-semibold text-white">
                PressPass
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <span className="text-6xl">{slide.emoji}</span>
                <p className="font-semibold text-slate-800">{slide.title}</p>
                <p className="text-xs text-slate-500">{slide.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            onClick={() => setCurrent(i)}
            aria-label={`Показати екран «${slide.title}»`}
            className={`h-2 rounded-full transition-all ${
              i === current ? 'w-5 bg-blue-700' : 'w-2 bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">Приклад екранів застосунку</p>
    </div>
  );
}

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
    : null;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-blue-700 text-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-14 text-center">
          {/* Логотип платформи */}
          <img src="/icons/logo.png" alt="Логотип PressPass" className="mb-5 h-20 w-20" />
          <h1 className="text-4xl font-extrabold tracking-tight">PressPass</h1>
          <p className="mt-3 max-w-xl text-lg text-blue-100">{HERO_UK}</p>
          <p className="mt-2 max-w-xl text-sm text-blue-200">{HERO_EN}</p>
        </div>
      </header>

      {/* Шість карток-переваг одразу під hero */}
      <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-2xl bg-white p-6 shadow">
            <p className="text-3xl">{feature.emoji}</p>
            <h2 className="mt-2 font-semibold">{feature.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{feature.text}</p>
          </div>
        ))}
      </section>

      {/* Основна частина: ліворуч слайдшоу-макет, праворуч вхід/реєстрація */}
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-6 lg:grid-cols-2">
        <PhoneSlideshow />
        <div className="rounded-2xl bg-white p-8 shadow">
          <h2 className="text-xl font-bold text-slate-800">Почніть роботу</h2>
          <p className="mt-2 text-sm text-slate-500">
            Увійдіть до наявного акаунта або створіть новий, щоб отримати доступ до свого
            посвідчення.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {session && primaryAction ? (
              <Link
                href={primaryAction.href}
                className="rounded-xl bg-blue-700 px-8 py-3 text-center text-base font-semibold text-white shadow transition hover:bg-blue-800"
              >
                {primaryAction.label}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl bg-blue-700 px-8 py-3 text-center text-base font-semibold text-white shadow transition hover:bg-blue-800"
                >
                  Увійти
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl border-2 border-blue-700 px-8 py-3 text-center text-base font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  Зареєструватись
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* «Про застосунок» на всю ширину, знизу */}
      <section className="mx-auto w-full max-w-3xl px-4 py-12">
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

      <footer className="mt-auto border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
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
