'use client';

import {
  DEFAULT_CARD_TEMPLATE,
  type BrandingInfo,
  type CardQr,
  type CardResponse,
  type CardStatus,
  type CardTemplate,
} from '@presspass/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PressCard } from '@/components/PressCard';
import { api, ApiError } from '@/lib/api';
import { clearSession, getToken } from '@/lib/auth';
import { useFitScale } from '@/lib/useFitScale';

const STATUS_DOT: Record<CardStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  BLOCKED: 'bg-red-500',
  EXPIRED: 'bg-amber-500',
};

/**
 * Journalist's card screen. A journalist may hold several credentials (from
 * different editorials): the hamburger menu switches between them, opens the
 * questionnaire and signs out. Within a card, swipe left/right (or tap) flips
 * to the English side; pull down to refresh; the QR auto-refreshes every 30 s.
 * The last successful response is served offline by the SW.
 */
export default function CardPage() {
  const router = useRouter();
  const [cards, setCards] = useState<CardResponse[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [template, setTemplate] = useState<CardTemplate | null>(null);
  const [nszhuLogoPath, setNszhuLogoPath] = useState<string | null>(null);
  const [qr, setQr] = useState<CardQr | null>(null);
  const [qrStale, setQrStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCardYet, setNoCardYet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingJoins, setPendingJoins] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const { theme } = template ?? DEFAULT_CARD_TEMPLATE;
  const fit = useFitScale(theme.cardWidth, theme.cardHeight);

  // Pending editorial join requests: surface a badge/menu entry pointing to the
  // questionnaire screen where the journalist confirms or rejects them.
  useEffect(() => {
    void api<{ id: number }[]>('/me/join-requests')
      .then((list) => setPendingJoins(list.length))
      .catch(() => setPendingJoins(0));
  }, []);

  // The card currently shown (selected, else the first — already primary-first).
  const card = useMemo(
    () => cards.find((c) => c.id === selectedId) ?? cards[0] ?? null,
    [cards, selectedId],
  );

  const loadCards = useCallback(async () => {
    setError(null);
    setNoCardYet(false);
    try {
      const list = await api<CardResponse[]>('/cards');
      setCards(list);
      if (list.length === 0) {
        setNoCardYet(true);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      // Authenticated but the short-lived encryption session is gone (app was
      // reopened, or it expired): re-unlock instead of showing a raw error.
      if (err instanceof ApiError && err.message === 'Encryption unlock required') {
        router.replace('/encryption?next=/card');
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'Немає з’єднання. Показується останнє збережене посвідчення, якщо воно є.',
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    void loadCards();
    void api<BrandingInfo>('/branding', { auth: false })
      .then((b) => setNszhuLogoPath(b.nszhuLogoPath))
      .catch(() => undefined);
  }, [router, loadCards]);

  // Load the design of the selected card's issuing editorial.
  const editorialId = card?.editorial?.id;
  useEffect(() => {
    if (!card) {
      setTemplate(null);
      return;
    }
    let cancelled = false;
    const query = editorialId ? `?editorialId=${editorialId}` : '';
    setTemplate(null);
    void api<CardTemplate>(`/card-template${query}`, { auth: false })
      .then((loaded) => {
        if (!cancelled) {
          setTemplate(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTemplate(DEFAULT_CARD_TEMPLATE);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [card?.id, editorialId]);

  const cardId = card?.id;
  // Returns the QR's validity in seconds so the caller can align the next
  // refresh with expiry (regeneration and validity coincide).
  const refreshQr = useCallback(async (): Promise<number> => {
    if (!cardId) {
      return 30;
    }
    try {
      const fresh = await api<CardQr>(`/card/qr?cardId=${cardId}`);
      setQr(fresh);
      setQrStale(false);
      return fresh.expiresInSeconds > 0 ? fresh.expiresInSeconds : 30;
    } catch {
      setQrStale(true);
      return 30;
    }
  }, [cardId]);

  // Dynamic QR: regenerate exactly when the current code expires, so a shown QR
  // is always the freshest and its lifetime matches the server-side validity.
  useEffect(() => {
    if (!cardId) {
      return;
    }
    setQr(null);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = async () => {
      const ttl = await refreshQr();
      if (active) {
        timer = setTimeout(() => void cycle(), Math.max(5, ttl) * 1000);
      }
    };
    void cycle();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cardId, refreshQr]);

  async function pullRefresh() {
    setRefreshing(true);
    await loadCards();
    void refreshQr();
    setTimeout(() => setRefreshing(false), 400);
  }

  async function makePrimary() {
    if (!card) {
      return;
    }
    try {
      setCards(
        await api<CardResponse[]>('/card/primary', { method: 'PUT', body: { cardId: card.id } }),
      );
      setMenuOpen(false);
    } catch {
      /* ignore — non-critical */
    }
  }

  function selectCard(id: number) {
    setSelectedId(id);
    setFlipped(false);
    setMenuOpen(false);
  }

  function handleLogout() {
    void api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
    router.replace('/');
  }

  function onTouchStart(e: React.TouchEvent) {
    const p = e.touches[0];
    touch.current = p ? { x: p.clientX, y: p.clientY } : null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    const p = e.changedTouches[0];
    touch.current = null;
    if (!start || !p) {
      return;
    }
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      setFlipped((f) => !f);
    } else if (dy > 80 && dy > Math.abs(dx) && window.scrollY < 10) {
      void pullRefresh();
    }
  }

  return (
    <main
      className="flex h-[100dvh] flex-col items-center gap-2 overflow-hidden p-3 pt-12"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="fixed right-4 top-4 z-20">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Меню"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl leading-none text-slate-700 shadow hover:bg-slate-50"
        >
          ☰
          {pendingJoins > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
              {pendingJoins}
            </span>
          )}
        </button>
        {menuOpen && (
          <div className="mt-2 w-72 rounded-2xl bg-white p-2 text-sm shadow-xl ring-1 ring-slate-200">
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push('/profile');
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50"
            >
              <span>Анкета</span>
              {pendingJoins > 0 ? (
                <span className="rounded-full bg-amber-500 px-2 text-xs font-bold text-white">
                  {pendingJoins} запит(ів)
                </span>
              ) : (
                <span aria-hidden>›</span>
              )}
            </button>

            {cards.length > 0 && (
              <div className="my-1 border-t border-slate-100 pt-1">
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Посвідчення
                </p>
                {cards.map((c) => {
                  const name = c.editorial?.displayNameUk || c.editorial?.name || 'Посвідчення';
                  const active = c.id === card?.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectCard(c.id)}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50 ${
                        active ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[c.status]}`} />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      {c.isPrimary && <span className="text-amber-500">★</span>}
                      {active && <span className="text-blue-600">✓</span>}
                    </button>
                  );
                })}
                {cards.length > 1 && card && !card.isPrimary && (
                  <button
                    onClick={() => void makePrimary()}
                    className="mt-1 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    ☆ Зробити поточне основним
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleLogout}
              className="mt-1 flex w-full items-center justify-between rounded-xl border-t border-slate-100 px-3 py-2 text-left text-red-600 hover:bg-red-50"
            >
              <span>Вихід</span>
              <span aria-hidden>×</span>
            </button>
          </div>
        )}
      </div>

      {refreshing && <p className="text-xs text-slate-400">Оновлення…</p>}
      {loading && <p className="text-slate-500">Завантаження посвідчення…</p>}

      {noCardYet && (
        <div className="w-full max-w-md rounded-xl bg-blue-50 p-5 text-sm text-blue-900">
          <p className="font-semibold">Посвідчення ще не видано</p>
          <p className="mt-1">
            Переконайтеся, що ваша{' '}
            <button onClick={() => router.push('/profile')} className="font-semibold underline">
              анкета
            </button>{' '}
            заповнена повністю — після перевірки даних адміністратор видасть вам посвідчення.
          </p>
        </div>
      )}
      {!loading && error && cards.length === 0 && (
        <div className="w-full max-w-md rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      )}

      {card && card.status !== 'ACTIVE' && (
        <div
          className={`w-full max-w-md flex-shrink-0 rounded-xl p-4 text-center text-sm font-semibold ${
            card.status === 'BLOCKED' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {card.status === 'BLOCKED'
            ? '⛔ Посвідчення анульоване — недійсне'
            : '⌛ Строк дії посвідчення минув — недійсне'}
        </div>
      )}

      {card && !template && (
        <div className="flex w-full min-h-0 flex-1 items-center justify-center text-sm text-slate-400">
          Завантаження дизайну посвідчення…
        </div>
      )}

      {card && template && (
        <>
          {/* Fills the remaining height; the card is scaled to fit it. */}
          <div ref={fit.ref} className="flex w-full min-h-0 flex-1 items-center justify-center">
            <div
              style={{ width: theme.cardWidth * fit.scale, height: theme.cardHeight * fit.scale }}
            >
              <div
                style={{
                  width: theme.cardWidth,
                  height: theme.cardHeight,
                  transform: `scale(${fit.scale})`,
                  transformOrigin: 'top left',
                  perspective: 1200,
                }}
              >
                <div
                  onClick={() => setFlipped((f) => !f)}
                  className="relative h-full w-full cursor-pointer transition-transform duration-500"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: flipped ? 'rotateY(180deg)' : 'none',
                  }}
                >
                  <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                    <PressCard
                      card={card}
                      template={template}
                      qrUrl={qr?.verifyUrl}
                      lang="uk"
                      nszhuLogoPath={nszhuLogoPath}
                    />
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                  >
                    <PressCard
                      card={card}
                      template={template}
                      qrUrl={qr?.verifyUrl}
                      lang="en"
                      nszhuLogoPath={nszhuLogoPath}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex h-16 flex-shrink-0 flex-col items-center justify-start gap-1.5 overflow-hidden">
            <p className="text-center text-xs text-slate-400">
              {flipped
                ? 'Swipe ← → or tap for the Ukrainian version · pull down to refresh'
                : 'Свайп ← → або тап — English version · потягніть вниз, щоб оновити'}
            </p>
            {qrStale ? (
              <p className="w-full max-w-md rounded-xl bg-amber-50 p-3 text-center text-xs text-amber-800">
                {flipped
                  ? 'No connection — the QR code may have expired. Verification needs the internet.'
                  : 'Немає з’єднання — QR-код міг прострочитися. Для перевірки потрібен інтернет.'}
              </p>
            ) : (
              qr && (
                <p className="text-center text-xs text-slate-400">
                  {flipped
                    ? '🔒 The QR code is protected and refreshes automatically every 30 seconds'
                    : '🔒 QR-код захищений і оновлюється автоматично кожні 30 секунд'}
                </p>
              )
            )}
          </div>
        </>
      )}
    </main>
  );
}
