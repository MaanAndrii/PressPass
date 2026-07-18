'use client';

import { Button, Field } from '@presspass/ui';
import { transliterateUk, type UserProfile } from '@presspass/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { api, ApiError, apiUpload } from '@/lib/api';
import { clearSession, getToken } from '@/lib/auth';
import { photoUrl } from '@/lib/config';
import { JoinRequestsPanel } from '@/components/JoinRequestsPanel';

/**
 * Анкета користувача після реєстрації. Всі поля обовʼязкові — без повністю
 * заповненої анкети адміністратор не може видати посвідчення.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    fullNameEn: '',
    birthDate: '',
    passportData: '',
    taxNumber: '',
    phone: '',
    nszhuMember: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  // Once the Latin name is edited by hand, stop auto-transliterating it.
  const enEdited = useRef(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    void api<UserProfile>('/me')
      .then((user) => {
        setProfile(user);
        if (user.journalist) {
          enEdited.current = Boolean(user.journalist.fullNameEn);
          setForm({
            fullName: user.journalist.fullName,
            fullNameEn: user.journalist.fullNameEn ?? '',
            birthDate: user.journalist.birthDate ?? '',
            passportData: user.journalist.passportData ?? '',
            taxNumber: user.journalist.taxNumber ?? '',
            phone: user.journalist.phone ?? '',
            nszhuMember: Boolean(user.journalist.nszhuMember),
          });
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        // Reopened app / expired encryption session: re-unlock, don't error.
        if (err instanceof ApiError && err.message === 'Encryption unlock required') {
          router.replace('/encryption?next=/profile');
          return;
        }
        setError('Не вдалося завантажити профіль');
      })
      // Форму показуємо лише після завантаження профілю, інакше відповідь
      // /me перезапише те, що користувач уже встиг ввести.
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const updated = await api<UserProfile>('/profile', { method: 'PUT', body: form });
      setProfile(updated);
      setSaved(true);
      // Анкета заповнена повністю → ведемо на екран очікування/посвідчення.
      if (updated.journalist?.profileComplete) {
        setTimeout(() => router.push('/card'), 900);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Помилка збереження анкети');
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    void api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
    router.replace('/');
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);
    try {
      setProfile(await apiUpload<UserProfile>('/profile/photo', 'photo', file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Помилка завантаження фото');
    }
  }

  const journalist = profile?.journalist;
  const profileComplete = Boolean(journalist?.profileComplete);
  const photo = photoUrl(journalist?.photoPath ?? null);

  return (
    <main className="mx-auto max-w-xl p-4 py-8">
      <div className="mb-4 flex items-center justify-between text-sm">
        <Link href="/" className="text-slate-500 hover:underline">
          ← На головну
        </Link>
        <button onClick={handleLogout} className="text-slate-500 hover:text-slate-800">
          Вийти
        </button>
      </div>

      <div className="mb-4">
        <JoinRequestsPanel />
      </div>
      <h1 className="mb-1 text-2xl font-bold text-blue-700">Анкета журналіста</h1>
      <p className="mb-6 text-sm text-slate-500">
        {profileComplete
          ? 'Ваша анкета заповнена та доступна лише для перегляду. Унікальний ID можна скопіювати нижче.'
          : 'Заповніть усі поля та додайте фото. Після перевірки даних адміністратор видасть вам електронне посвідчення.'}
      </p>

      {loading && <p className="text-slate-500">Завантаження анкети…</p>}

      {!loading && journalist && (
        <div className="mb-4 rounded-2xl bg-blue-50 p-5">
          <p className="text-sm text-blue-900">Ваш унікальний ID</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-wide text-blue-800">
              {journalist.publicId}
            </span>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(journalist.publicId).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {copied ? 'Скопійовано ✓' : 'Скопіювати ID'}
            </button>
          </div>
          <p className="mt-2 text-xs text-blue-900/80">
            Передайте цей код адміністратору вашого медіа, щоб він додав вас до редакції.
          </p>
          {profile && profile.memberships.length > 0 && (
            <p className="mt-3 text-sm text-blue-900">
              Ви в редакціях:{' '}
              <span className="font-semibold">
                {profile.memberships.map((m) => m.name).join(', ')}
              </span>
            </p>
          )}
        </div>
      )}

      {!loading && journalist?.profileComplete && (
        <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          ✅ Анкету заповнено повністю. Очікуйте на видачу посвідчення адміністратором.{' '}
          <button onClick={() => router.push('/card')} className="font-semibold underline">
            Перейти до посвідчення
          </button>
        </div>
      )}

      {!loading && profile && (
        <>
          <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white p-5 shadow">
            {photo ? (
              <img
                src={photo}
                alt="Ваше фото"
                className="h-28 w-21 rounded-lg object-cover ring-1 ring-slate-200"
                style={{ width: '5.25rem' }}
              />
            ) : (
              <div
                className="flex h-28 w-21 items-center justify-center rounded-lg bg-slate-200 text-3xl text-slate-400"
                style={{ width: '5.25rem' }}
              >
                👤
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Фото для посвідчення <span className="text-red-500">*</span>
              </p>
              {profileComplete ? (
                <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-500">
                  Фото вже додано. Редагування анкети вимкнено.
                </p>
              ) : (
                <>
                  <label className="cursor-pointer rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300">
                    {journalist?.photoPath ? 'Замінити фото' : 'Завантажити фото'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => void handlePhoto(e.target.files?.[0])}
                    />
                  </label>
                  <p className="mt-2 text-xs text-slate-400">JPEG, PNG або WebP, до 5 МБ</p>
                </>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-5 shadow">
            <Field
              disabled={profileComplete}
              label="ПІП (повністю) *"
              required
              minLength={5}
              value={form.fullName}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => ({
                  ...f,
                  fullName: value,
                  fullNameEn: enEdited.current ? f.fullNameEn : transliterateUk(value),
                }));
              }}
            />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  disabled={profileComplete}
                  label="ПІП латиницею (для картки)"
                  placeholder="Mariia Sydorenko"
                  value={form.fullNameEn}
                  onChange={(e) => {
                    enEdited.current = true;
                    setForm({ ...form, fullNameEn: e.target.value });
                  }}
                />
              </div>
              {!profileComplete && (
                <button
                  type="button"
                  onClick={() => {
                    enEdited.current = false;
                    setForm((f) => ({ ...f, fullNameEn: transliterateUk(f.fullName) }));
                  }}
                  className="mb-0.5 shrink-0 rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-300"
                  title="Згенерувати з ПІБ за правилами транслітерації"
                >
                  Транслітерувати
                </button>
              )}
            </div>
            <Field
              disabled={profileComplete}
              label="Дата народження *"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
            <Field
              disabled={profileComplete}
              label="Паспортні дані (серія, номер, ким виданий) *"
              required
              minLength={6}
              value={form.passportData}
              onChange={(e) => setForm({ ...form, passportData: e.target.value })}
            />
            <Field
              disabled={profileComplete}
              label="ІПН (10 цифр) *"
              required
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              value={form.taxNumber}
              onChange={(e) => setForm({ ...form, taxNumber: e.target.value.replace(/\D/g, '') })}
            />
            <Field
              disabled={profileComplete}
              label="Телефон *"
              type="tel"
              required
              placeholder="+380501234567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                disabled={profileComplete}
                checked={form.nszhuMember}
                onChange={(e) => setForm({ ...form, nszhuMember: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Я — член Національної спілки журналістів України (НСЖУ)
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && (
              <p className="text-sm text-emerald-600">
                Анкету збережено ✓ {journalist?.profileComplete && 'Переходимо до посвідчення…'}
              </p>
            )}
            {!profileComplete && (
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Збереження…' : 'Зберегти анкету'}
              </Button>
            )}
          </form>
        </>
      )}
    </main>
  );
}
