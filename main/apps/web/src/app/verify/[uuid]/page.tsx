import type { VerifyResponse } from '@presspass/shared';

import { StatusBadge } from '@/components/StatusBadge';
import { apiBaseForServer, photoUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

async function fetchVerification(uuid: string, token?: string): Promise<VerifyResponse | null> {
  try {
    const query = token ? `?t=${encodeURIComponent(token)}` : '';
    const response = await fetch(
      `${apiBaseForServer()}/verify/${encodeURIComponent(uuid)}${query}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as VerifyResponse;
  } catch {
    return null;
  }
}

/**
 * Публічна сторінка перевірки, відкривається з QR-коду.
 * QR динамічний: без дійсного короткоживучого токена (`?t=...`) сервер не
 * повертає жодних даних — показується інструкція попросити свіжий QR.
 */
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { uuid } = await params;
  const { t } = await searchParams;
  const result = await fetchVerification(uuid, t);

  const qrProblem = result !== null && result.qrStatus !== 'VALID';

  return (
    <main className="flex min-h-screen flex-col items-center p-4 pt-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <header
          className={`px-6 py-4 text-center text-white ${
            result?.valid ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          <h1 className="text-xl font-bold">
            {result === null && 'ПОСВІДЧЕННЯ НЕ ЗНАЙДЕНО'}
            {result !== null && qrProblem && 'QR-КОД НЕДІЙСНИЙ'}
            {result !== null &&
              !qrProblem &&
              (result.valid ? 'ПОСВІДЧЕННЯ ДІЙСНЕ' : 'ПОСВІДЧЕННЯ НЕДІЙСНЕ')}
          </h1>
        </header>

        {result === null && (
          <p className="px-6 py-8 text-center text-sm text-slate-500">
            Перевірте, чи QR-код відскановано повністю, або спробуйте пізніше.
          </p>
        )}

        {result !== null && qrProblem && (
          <div className="px-6 py-8 text-sm text-slate-600">
            <p className="font-semibold">
              {result.qrStatus === 'EXPIRED'
                ? 'Строк дії цього QR-коду минув.'
                : 'Посилання не містить дійсного коду перевірки.'}
            </p>
            <p className="mt-2">
              QR-код посвідчення динамічний і оновлюється кожні 30 секунд — скриншоти та копії не
              працюють. Попросіть журналіста відкрити застосунок PressPass і відскануйте актуальний
              QR-код з екрана.
            </p>
          </div>
        )}

        {result !== null && !qrProblem && (
          <div className="px-6 py-6">
            <div className="flex gap-4">
              {photoUrl(result.photoPath ?? null) ? (
                <img
                  src={photoUrl(result.photoPath ?? null)!}
                  alt={`Фото: ${result.fullName}`}
                  className="h-32 w-24 rounded-lg object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="flex h-32 w-24 items-center justify-center rounded-lg bg-slate-200 text-3xl text-slate-400">
                  👤
                </div>
              )}
              <dl className="flex-1 space-y-1.5 text-sm">
                <div>
                  <dt className="text-xs uppercase text-slate-400">ПІБ</dt>
                  <dd className="font-semibold">{result.fullName}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Посада</dt>
                  <dd>{result.position}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Редакція</dt>
                  <dd>{result.organization}</dd>
                </div>
              </dl>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-sm">
              <div>
                <dt className="text-xs uppercase text-slate-400">Номер</dt>
                <dd className="font-mono font-semibold">{result.cardNumber}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">Статус</dt>
                <dd>{result.status && <StatusBadge status={result.status} />}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">Дійсне до</dt>
                <dd>{result.expireDate}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-400">Перевірка</dt>
                <dd className="text-emerald-700">🔒 динамічний QR</dd>
              </div>
            </dl>

            {result.editorial && (
              <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                {photoUrl(result.editorial.logoPath) && (
                  <img
                    src={photoUrl(result.editorial.logoPath)!}
                    alt={`Логотип: ${result.editorial.name}`}
                    className="h-12 w-12 rounded object-contain ring-1 ring-slate-200"
                  />
                )}
                <div className="min-w-0 text-sm">
                  <p className="text-xs uppercase text-slate-400">Видано редакцією</p>
                  <p className="font-semibold">
                    {result.editorial.displayNameUk || result.editorial.name}
                  </p>
                  {result.editorial.website && (
                    <a
                      href={result.editorial.website}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-xs text-blue-600 hover:underline"
                    >
                      Реєстр посвідчень ↗
                    </a>
                  )}
                </div>
              </div>
            )}
            {result.nszhuMember && (
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-blue-50 p-3">
                {photoUrl(result.nszhuLogoPath ?? null) && (
                  <img
                    src={photoUrl(result.nszhuLogoPath ?? null)!}
                    alt="Логотип НСЖУ"
                    className="h-10 w-10 rounded object-contain"
                  />
                )}
                <p className="text-sm font-semibold text-blue-900">
                  Член Національної спілки журналістів України
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400">PressPass Platform — перевірка посвідчень</p>
    </main>
  );
}
