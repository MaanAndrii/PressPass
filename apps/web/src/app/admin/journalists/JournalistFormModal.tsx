'use client';

import { Button, Field, Modal } from '@presspass/ui';
import { transliterateUk, type AdminJournalist } from '@presspass/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { api, ApiError, apiUpload } from '@/lib/api';
import { photoUrl } from '@/lib/config';

const EMPTY = {
  email: '',
  password: '',
  fullName: '',
  fullNameEn: '',
  birthDate: '',
  passportData: '',
  taxNumber: '',
  phone: '',
  nszhuMember: false,
};

/**
 * Create/edit journalist form in a modal — all personal data of the journalist.
 * The Latin name is auto-transliterated from the Ukrainian one (KMU rules) but
 * stays editable. Position and organization are NOT set here — the issuing
 * editorial fills them when a card is issued.
 */
export function JournalistFormModal({
  open,
  journalist,
  onClose,
  onSaved,
}: {
  open: boolean;
  journalist: AdminJournalist | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = journalist !== null;
  const [form, setForm] = useState(EMPTY);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // Once the Latin name is edited by hand, stop auto-transliterating it.
  const enEdited = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setPhotoFile(null);
    enEdited.current = Boolean(journalist?.fullNameEn);
    setForm(
      journalist
        ? {
            email: journalist.email,
            password: '',
            fullName: journalist.fullName,
            fullNameEn: journalist.fullNameEn,
            birthDate: journalist.birthDate ?? '',
            passportData: journalist.passportData ?? '',
            taxNumber: journalist.taxNumber ?? '',
            phone: journalist.phone ?? '',
            nszhuMember: journalist.nszhuMember,
          }
        : EMPTY,
    );
    setPhotoPreview(photoUrl(journalist?.photoPath ?? null));
  }, [open, journalist]);

  /** Updating the Ukrainian name also refreshes the (unedited) Latin one. */
  function setFullName(value: string) {
    setForm((f) => ({
      ...f,
      fullName: value,
      fullNameEn: enEdited.current ? f.fullNameEn : transliterateUk(value),
    }));
  }

  function pickPhoto(file: File | undefined) {
    if (!file) {
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, string | boolean> = {
        email: form.email,
        fullName: form.fullName,
        fullNameEn: form.fullNameEn,
        birthDate: form.birthDate,
        passportData: form.passportData,
        taxNumber: form.taxNumber,
        phone: form.phone,
        nszhuMember: form.nszhuMember,
      };
      // Omit empty optional fields so validation doesn't reject blank values.
      for (const key of ['birthDate', 'passportData', 'taxNumber', 'phone'] as const) {
        if (!body[key]) {
          delete body[key];
        }
      }
      let id = journalist?.id;
      if (!isEdit) {
        body.password = form.password;
        const created = await api<AdminJournalist>('/admin/journalists', {
          method: 'POST',
          body,
        });
        id = created.id;
      } else {
        if (form.password) {
          body.password = form.password;
        }
        await api(`/admin/journalists/${journalist.id}`, { method: 'PUT', body });
      }
      if (photoFile && id) {
        await apiUpload(`/admin/journalists/${id}/photo`, 'photo', photoFile);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Помилка збереження');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Редагування журналіста' : 'Новий журналіст'}
    >
      {/* autoComplete=off stops the browser from injecting the admin's own login. */}
      <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
        <div className="flex items-center gap-4">
          {photoPreview ? (
            <img
              src={photoPreview}
              alt="Фото журналіста"
              className="h-24 w-18 rounded-lg object-cover ring-1 ring-slate-200"
              style={{ width: '4.5rem' }}
            />
          ) : (
            <div
              className="flex h-24 items-center justify-center rounded-lg bg-slate-200 text-2xl text-slate-400"
              style={{ width: '4.5rem' }}
            >
              👤
            </div>
          )}
          <label className="cursor-pointer rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300">
            {photoPreview ? 'Змінити фото' : 'Завантажити фото'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Email"
            type="email"
            required
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Field
            label={isEdit ? 'Новий пароль (не обовʼязково)' : 'Пароль'}
            type="password"
            required={!isEdit}
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>

        <Field
          label="ПІБ"
          required
          autoComplete="off"
          value={form.fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field
              label="ПІБ латиницею (для картки)"
              placeholder="Ivan Petrenko"
              autoComplete="off"
              value={form.fullNameEn}
              onChange={(e) => {
                enEdited.current = true;
                setForm({ ...form, fullNameEn: e.target.value });
              }}
            />
          </div>
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Дата народження"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            autoComplete="off"
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          />
          <Field
            label="Телефон"
            type="tel"
            placeholder="+380501234567"
            autoComplete="off"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <Field
          label="Паспортні дані (серія, номер, ким виданий)"
          autoComplete="off"
          value={form.passportData}
          onChange={(e) => setForm({ ...form, passportData: e.target.value })}
        />
        <Field
          label="ІПН (10 цифр)"
          inputMode="numeric"
          maxLength={10}
          autoComplete="off"
          value={form.taxNumber}
          onChange={(e) => setForm({ ...form, taxNumber: e.target.value.replace(/\D/g, '') })}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.nszhuMember}
            onChange={(e) => setForm({ ...form, nszhuMember: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-slate-700">Член НСЖУ (Національна спілка журналістів України)</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Скасувати
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Збереження…' : isEdit ? 'Зберегти' : 'Створити'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
