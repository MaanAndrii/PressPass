'use client';

import { Button, Field, Modal } from '@presspass/ui';
import {
  CARD_NUMBER_TOKENS,
  DEFAULT_CARD_NUMBER_TEMPLATE,
  renderCardNumber,
  type Editorial,
} from '@presspass/shared';
import { type FormEvent, useEffect, useState } from 'react';

import { api, ApiError, apiUpload } from '@/lib/api';
import { photoUrl } from '@/lib/config';

/** Formats input into the media-id mask ***-***** (e.g. R40-02551). */
function formatMediaId(value: string): string {
  const clean = value
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

const EMPTY = {
  name: '',
  displayNameUk: '',
  displayNameEn: '',
  mediaId: '',
  edrpou: '',
  website: '',
  director: '',
  email: '',
  address: '',
  phone: '',
  cardNumberPrefix: '',
  cardNumberTemplate: DEFAULT_CARD_NUMBER_TEMPLATE,
};

/** Create/edit an issuing company, with logo upload once it exists. */
export function EditorialFormModal({
  open,
  editorial,
  onClose,
  onSaved,
}: {
  open: boolean;
  editorial: Editorial | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editorial) {
      setForm({
        name: editorial.name,
        displayNameUk: editorial.displayNameUk,
        displayNameEn: editorial.displayNameEn,
        mediaId: editorial.mediaId,
        edrpou: editorial.edrpou,
        website: editorial.website,
        director: editorial.director,
        email: editorial.email,
        address: editorial.address,
        phone: editorial.phone,
        cardNumberPrefix: editorial.cardNumberPrefix,
        cardNumberTemplate: editorial.cardNumberTemplate || DEFAULT_CARD_NUMBER_TEMPLATE,
      });
      setLogoPath(editorial.logoPath);
      setSavedId(editorial.id);
    } else {
      setForm(EMPTY);
      setLogoPath(null);
      setSavedId(null);
    }
    setError(null);
  }, [open, editorial]);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    // Send only the fields the API accepts; empty optionals are omitted.
    const body: Record<string, string> = { name: form.name.trim() };
    const optional = [
      'displayNameUk',
      'displayNameEn',
      'mediaId',
      'edrpou',
      'website',
      'director',
      'email',
      'address',
      'phone',
    ] as const;
    for (const key of optional) {
      if (form[key].trim()) {
        body[key] = form[key].trim();
      }
    }
    // Prefix is always sent (empty clears it → legacy global numbering).
    body.cardNumberPrefix = form.cardNumberPrefix.trim().toUpperCase();
    if (form.cardNumberTemplate.trim()) {
      body.cardNumberTemplate = form.cardNumberTemplate.trim();
    }
    try {
      const saved = savedId
        ? await api<Editorial>(`/admin/editorials/${savedId}`, { method: 'PUT', body })
        : await api<Editorial>('/admin/editorials', { method: 'POST', body });
      setSavedId(saved.id);
      setLogoPath(saved.logoPath);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося зберегти редакцію');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogo(file: File | undefined) {
    if (!file || !savedId) {
      return;
    }
    setError(null);
    try {
      const saved = await apiUpload<Editorial>(`/admin/editorials/${savedId}/logo`, 'logo', file);
      setLogoPath(saved.logoPath);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Помилка завантаження логотипа');
    }
  }

  const logo = photoUrl(logoPath);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editorial ? 'Редагувати редакцію' : 'Нова редакція'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Закрити
          </Button>
          <Button form="editorial-form" type="submit" disabled={busy}>
            {busy ? 'Збереження…' : 'Зберегти'}
          </Button>
        </>
      }
    >
      <form id="editorial-form" onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="Повна юридична назва *"
          required
          minLength={2}
          placeholder="ТОВ «Приклад Медіа»"
          value={form.name}
          onChange={set('name')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Назва в посвідченні (укр.)"
            placeholder="Онлайн-медіа «Приклад»"
            value={form.displayNameUk}
            onChange={set('displayNameUk')}
          />
          <Field
            label="Назва в посвідченні (англ.)"
            placeholder="«Pryklad» Media"
            value={form.displayNameEn}
            onChange={set('displayNameEn')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Ідентифікатор медіа"
            placeholder="R40-02551"
            value={form.mediaId}
            onChange={(e) => setForm((f) => ({ ...f, mediaId: formatMediaId(e.target.value) }))}
          />
          <Field
            label="Код ЄДРПОУ"
            inputMode="numeric"
            placeholder="12345678"
            value={form.edrpou}
            onChange={(e) => setForm((f) => ({ ...f, edrpou: e.target.value.replace(/\D/g, '') }))}
          />
        </div>
        <Field label="Директор (керівник)" value={form.director} onChange={set('director')} />
        <Field
          label="Офіційний сайт (реєстр посвідчень)"
          type="url"
          placeholder="https://…"
          value={form.website}
          onChange={set('website')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Електронна адреса"
            type="email"
            value={form.email}
            onChange={set('email')}
          />
          <Field label="Контактний телефон" type="tel" value={form.phone} onChange={set('phone')} />
        </div>
        <Field label="Фізична адреса" value={form.address} onChange={set('address')} />

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Нумерація посвідчень</p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Префікс (унікальний)"
              placeholder="KV"
              value={form.cardNumberPrefix}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  cardNumberPrefix: e.target.value
                    .replace(/[^A-Za-z0-9-]/g, '')
                    .toUpperCase()
                    .slice(0, 12),
                }))
              }
            />
            <Field
              label="Шаблон номера"
              placeholder={DEFAULT_CARD_NUMBER_TEMPLATE}
              value={form.cardNumberTemplate}
              onChange={set('cardNumberTemplate')}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {CARD_NUMBER_TOKENS.map(({ token, label }) => (
              <button
                key={token}
                type="button"
                title={label}
                onClick={() =>
                  setForm((f) => ({ ...f, cardNumberTemplate: f.cardNumberTemplate + token }))
                }
                className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs text-slate-600 hover:bg-slate-50"
              >
                {token}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Приклад:{' '}
            <span className="font-mono font-semibold text-slate-700">
              {renderCardNumber(form.cardNumberTemplate || DEFAULT_CARD_NUMBER_TEMPLATE, {
                prefix: form.cardNumberPrefix || 'PP',
                year: new Date().getFullYear(),
                seq: 42,
                mediaId: form.mediaId || 'R40-02551',
              })}
            </span>
            . Лічильник скидається щороку. Без префікса — спільна нумерація «PP-рік-№».
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Логотип</p>
          {savedId ? (
            <div className="flex items-center gap-3">
              {logo ? (
                <img
                  src={logo}
                  alt="Логотип редакції"
                  className="h-14 w-14 rounded object-contain ring-1 ring-slate-200"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-2xl text-slate-300">
                  🏢
                </div>
              )}
              <label className="cursor-pointer rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300">
                {logo ? 'Замінити логотип' : 'Завантажити логотип'}
                <input
                  type="file"
                  accept="image/svg+xml,image/png,image/webp,image/jpeg"
                  className="hidden"
                  onChange={(e) => void handleLogo(e.target.files?.[0])}
                />
              </label>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Спершу збережіть редакцію, потім можна додати логотип.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
