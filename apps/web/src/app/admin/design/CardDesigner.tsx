'use client';

import { Button } from '@presspass/ui';
import {
  DEFAULT_CARD_TEMPLATE,
  IMAGE_BINDINGS,
  moveElement,
  resizeElementFromBottomRight,
  rotatedBoundingBox,
  sanitizeCardTemplate,
  TEXT_BINDINGS,
  type CardElement,
  type CardElementType,
  type CardLang,
  type CardTemplate,
  type FontFamily,
  type Guides,
} from '@presspass/shared';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CardCanvasView } from '@/components/CardCanvasView';
import type { CardViewData } from '@/components/CardTemplateView';
import { api, ApiError } from '@/lib/api';
import { useFitScale } from '@/lib/useFitScale';

/** Sample data for the live preview (all bindings populated; NSZHU member). */
const SAMPLE: CardViewData = {
  fullName: 'Сидоренко Марія Олексіївна',
  fullNameEn: 'Mariia Sydorenko',
  position: 'Кореспондентка',
  positionEn: 'Correspondent',
  organization: 'Онлайн-медіа «Приклад»',
  organizationEn: '«Pryklad» Media',
  mediaId: 'R00-00000',
  cardNumber: 'PP-0000-000000',
  expireDate: '2027-12-31',
  status: 'ACTIVE',
  // Left empty so the preview shows the demo photo/logo placeholders.
  photoPath: null,
  logoOverride: null,
  nszhuMember: true,
};

/** Human labels for element bindings, shown in the properties panel. */
const BINDING_LABELS: Record<string, string> = {
  fullName: 'ПІБ',
  position: 'Посада',
  organization: 'Редакція',
  mediaId: 'Ідентифікатор медіа',
  cardNumber: 'Номер картки',
  expireDate: 'Дата дійсності',
  custom: 'Власний текст',
  photo: 'Фото журналіста',
  logo: 'Логотип редакції',
  nszhuLogo: 'Логотип НСЖУ (лише членам)',
};

const TYPE_LABELS: Record<CardElementType, string> = {
  text: 'Текст',
  image: 'Зображення',
  qr: 'QR-код',
  date: 'Дата',
};

const FONT_LABELS: Record<FontFamily, string> = {
  system: 'системний',
  sans: 'без засічок',
  serif: 'із засічками',
  mono: 'моноширинний',
  rounded: 'заокруглений',
};

const SNAP_THRESHOLD = 6;

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 36)
    : `el-${Date.now()}-${Math.round(Math.random() * 1e4)}`;
}

/** A freshly-added element of the given type, placed near the canvas centre. */
function makeElement(type: CardElementType, cx: number, cy: number): CardElement {
  const common = { id: uid(), x: Math.round(cx), y: Math.round(cy) };
  switch (type) {
    case 'image':
      return { ...common, type, binding: 'logo', width: 60, height: 60 };
    case 'qr':
      return { ...common, type, binding: 'qr', width: 100, height: 100 };
    case 'date':
      return { ...common, type, binding: 'expireDate', width: 200, height: 18, fontSize: 12 };
    case 'text':
    default:
      return {
        ...common,
        type,
        binding: 'custom',
        content: 'Новий текст',
        width: 160,
        height: 22,
        fontSize: 14,
        align: 'left',
      };
  }
}

/**
 * Offset from the stored (unrotated) top-left to the rotated bounding-box
 * top-left. Storage keeps `x`/`y` as the UNROTATED top-left and CSS rotates
 * around the centre, so for 90°/270° the visible box shifts. The designer shows
 * and edits this bounding-box top-left, so (0,0) is the top-left of the element
 * AS PLACED regardless of rotation — the coordinate origin turns with the field.
 */
function bboxOffset(el: Pick<CardElement, 'width' | 'height' | 'rotation'>): {
  dx: number;
  dy: number;
} {
  const step = (((Math.round((el.rotation ?? 0) / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const swap = step === 1 || step === 3;
  const bboxW = swap ? el.height : el.width;
  const bboxH = swap ? el.width : el.height;
  return { dx: (el.width - bboxW) / 2, dy: (el.height - bboxH) / 2 };
}

/** Rotates by ±90° while keeping the bounding-box top-left fixed (no jump). */
function rotateKeepingBox(el: CardElement, deltaDeg: number): Partial<CardElement> {
  const before = bboxOffset(el);
  const bx = el.x + before.dx;
  const by = el.y + before.dy;
  const rotation = ((((el.rotation ?? 0) + deltaDeg) % 360) + 360) % 360;
  const after = bboxOffset({ ...el, rotation });
  return { rotation, x: Math.round(bx - after.dx), y: Math.round(by - after.dy) };
}

/**
 * Drag-and-drop press-card designer (free `absolute` layout). A grid helps
 * alignment: dragged elements snap to grid nodes and to the canvas centre/edges
 * (with guide lines). Preview mode hides the grid to show the clean card.
 */
export function CardDesigner() {
  const params = useSearchParams();
  const editorialParam = params.get('editorial');
  const editorialId =
    editorialParam && /^\d+$/.test(editorialParam) ? Number(editorialParam) : null;
  const query = editorialId ? `?editorialId=${editorialId}` : '';

  const [template, setTemplate] = useState<CardTemplate>(DEFAULT_CARD_TEMPLATE);
  const [editorialName, setEditorialName] = useState<string | null>(null);
  const [nszhuLogoPath, setNszhuLogoPath] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<CardLang>('uk');
  const [guides, setGuides] = useState<Guides>({ v: null, h: null });
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const { theme, gridSize } = template;
  const fit = useFitScale(theme.cardWidth, theme.cardHeight);
  const previewData = useMemo(() => ({ ...SAMPLE, nszhuLogoPath }), [nszhuLogoPath]);
  const drag = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    ex: number;
    ey: number;
    ew: number;
    eh: number;
  } | null>(null);

  useEffect(() => {
    void api<CardTemplate>(`/card-template${query}`, { auth: false })
      .then(setTemplate)
      .catch(() => undefined);
    void api<{ nszhuLogoPath: string | null }>('/branding', { auth: false })
      .then((b) => setNszhuLogoPath(b.nszhuLogoPath))
      .catch(() => undefined);
  }, [query]);

  useEffect(() => {
    if (!editorialId) {
      setEditorialName(null);
      return;
    }
    void api<{ id: number; name: string; displayNameUk: string }[]>('/admin/editorials')
      .then((list) => {
        const ed = list.find((e) => e.id === editorialId);
        setEditorialName(ed ? ed.displayNameUk || ed.name : `#${editorialId}`);
      })
      .catch(() => setEditorialName(`#${editorialId}`));
  }, [editorialId]);

  const selected = useMemo(
    () => template.elements.find((e) => e.id === selectedId) ?? null,
    [template.elements, selectedId],
  );

  const dirty = () => setSaved(false);

  const updateElement = useCallback((id: string, patch: Partial<CardElement>) => {
    dirty();
    setTemplate((t) => ({
      ...t,
      elements: t.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, []);

  const snap = useCallback((v: number) => Math.round(v / gridSize) * gridSize, [gridSize]);

  function onPointerDown(e: React.PointerEvent, id: string, mode: 'move' | 'resize') {
    if (preview) {
      return;
    }
    e.stopPropagation();
    const el = template.elements.find((x) => x.id === id);
    if (!el) {
      return;
    }
    setSelectedId(id);
    drag.current = {
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      ex: el.x,
      ey: el.y,
      ew: el.width,
      eh: el.height,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) {
      return;
    }
    const dx = (e.clientX - d.startX) / fit.scale;
    const dy = (e.clientY - d.startY) / fit.scale;
    const cw = theme.cardWidth;
    const ch = theme.cardHeight;

    const start = {
      x: d.ex,
      y: d.ey,
      width: d.ew,
      height: d.eh,
      rotation: template.elements.find((el) => el.id === d.id)?.rotation,
    };

    if (d.mode === 'resize') {
      const next = resizeElementFromBottomRight(
        start,
        { x: dx, y: dy },
        { width: cw, height: ch },
        gridSize,
      );
      updateElement(d.id, { x: next.x, y: next.y, width: next.width, height: next.height });
      return;
    }

    const next = moveElement(
      start,
      { x: dx, y: dy },
      { width: cw, height: ch },
      gridSize,
      SNAP_THRESHOLD,
    );
    setGuides(next.guides);
    updateElement(d.id, { x: next.x, y: next.y });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag.current) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    }
    drag.current = null;
    setGuides({ v: null, h: null });
  }

  function addElement(type: CardElementType) {
    const el = makeElement(type, snap(theme.cardWidth / 2 - 40), snap(theme.cardHeight / 2 - 10));
    dirty();
    setTemplate((t) => ({ ...t, elements: [...t.elements, el] }));
    setSelectedId(el.id);
  }

  function removeSelected() {
    if (!selected) {
      return;
    }
    dirty();
    setTemplate((t) => ({ ...t, elements: t.elements.filter((e) => e.id !== selected.id) }));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) {
      return;
    }
    const copy = {
      ...selected,
      id: uid(),
      x: snap(selected.x + gridSize),
      y: snap(selected.y + gridSize),
    };
    dirty();
    setTemplate((t) => ({ ...t, elements: [...t.elements, copy] }));
    setSelectedId(copy.id);
  }

  function reorder(dir: 'front' | 'back') {
    if (!selected) {
      return;
    }
    dirty();
    setTemplate((t) => {
      const rest = t.elements.filter((e) => e.id !== selected.id);
      return { ...t, elements: dir === 'front' ? [...rest, selected] : [selected, ...rest] };
    });
  }

  const patchTheme = (patch: Partial<CardTemplate['theme']>) => {
    dirty();
    setTemplate((t) => ({ ...t, theme: { ...t.theme, ...patch } }));
  };

  async function handleSave() {
    setError(null);
    setBusy(true);
    try {
      const body: CardTemplate = { ...template, layoutMode: 'absolute' };
      setTemplate(await api<CardTemplate>(`/admin/card-template${query}`, { method: 'PUT', body }));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося зберегти дизайн');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!window.confirm('Скинути дизайн до стандартного?')) {
      return;
    }
    setError(null);
    try {
      setTemplate(
        await api<CardTemplate>(`/admin/card-template/reset${query}`, { method: 'POST' }),
      );
      setSelectedId(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не вдалося скинути');
    }
  }

  function exportJson() {
    const json = JSON.stringify(template, null, 2);
    void navigator.clipboard?.writeText(json).catch(() => undefined);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'press-card-template.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson() {
    try {
      const parsed = sanitizeCardTemplate(JSON.parse(importText));
      setTemplate({ ...parsed, layoutMode: 'absolute' });
      setSelectedId(null);
      setImportOpen(false);
      setImportText('');
      setError(null);
      dirty();
    } catch {
      setError('Некоректний JSON макета');
    }
  }

  const bindingOptions = selected
    ? selected.type === 'image'
      ? IMAGE_BINDINGS
      : selected.type === 'text'
        ? TEXT_BINDINGS
        : []
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Конструктор посвідчення</h1>
          <p className="text-sm text-slate-500">
            {editorialId ? (
              <>
                Дизайн редакції:{' '}
                <span className="font-medium text-slate-700">{editorialName ?? '…'}</span>
              </>
            ) : (
              'Стандартний дизайн (успадковують редакції без власного)'
            )}
          </p>
        </div>
        <p className="min-w-0 flex-1 text-sm text-slate-500">
          Перетягуйте поля по картці — сітка допомагає вирівнювати. У режимі перегляду сітка
          прихована.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={preview}
            onChange={(e) => {
              setPreview(e.target.checked);
              if (e.target.checked) {
                setSelectedId(null);
              }
            }}
            className="h-4 w-4"
          />
          Перегляд
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Дизайн збережено ✓</p>}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_280px]">
        {/* ── Палітра + тема ── */}
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-2 text-sm font-semibold">Додати поле</h2>
            <div className="grid grid-cols-2 gap-2">
              {(['text', 'image', 'qr', 'date'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => addElement(type)}
                  disabled={preview}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  + {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl bg-white p-4 shadow">
            <h2 className="text-sm font-semibold">Тема й бренд</h2>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">Фон картки</span>
              <input
                type="color"
                value={theme.backgroundColor}
                onChange={(e) => patchTheme({ backgroundColor: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-slate-300"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">Шрифт</span>
              <select
                value={theme.fontFamily}
                onChange={(e) => patchTheme({ fontFamily: e.target.value as FontFamily })}
                className="rounded-lg border border-slate-300 px-2 py-1"
              >
                {Object.entries(FONT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">Крок сітки</span>
              <input
                type="number"
                min={2}
                max={50}
                value={gridSize}
                onChange={(e) => {
                  dirty();
                  setTemplate((t) => ({ ...t, gridSize: Number(e.target.value) || 10 }));
                }}
                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Ширина</span>
                <input
                  type="number"
                  min={300}
                  max={520}
                  value={theme.cardWidth}
                  onChange={(e) => patchTheme({ cardWidth: Number(e.target.value) || 360 })}
                  className="rounded-lg border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Висота</span>
                <input
                  type="number"
                  min={480}
                  max={900}
                  value={theme.cardHeight}
                  onChange={(e) => patchTheme({ cardHeight: Number(e.target.value) || 640 })}
                  className="rounded-lg border border-slate-300 px-2 py-1"
                />
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Заголовок, підзаголовок і підпис під QR більше не окремі поля — додайте їх як
              звичайний текст («+ Текст») із власним написом українською та англійською.
            </p>
          </section>
        </div>

        {/* ── Полотно ── */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-end">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
              {(['uk', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setPreviewLang(l)}
                  className={`px-3 py-1 ${
                    previewLang === l ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'
                  }`}
                >
                  {l === 'uk' ? 'UA' : 'EN'}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={fit.ref}
            className="flex items-center justify-center rounded-xl bg-slate-100 p-4"
            style={{ height: '78vh' }}
            onPointerDown={() => !preview && setSelectedId(null)}
          >
            <div
              style={{ width: theme.cardWidth * fit.scale, height: theme.cardHeight * fit.scale }}
            >
              <div
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                  position: 'relative',
                  width: theme.cardWidth,
                  height: theme.cardHeight,
                  transform: `scale(${fit.scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <CardCanvasView
                  template={template}
                  data={previewData}
                  lang={previewLang}
                  demo={!preview}
                />

                {!preview && (
                  <>
                    {/* Grid overlay */}
                    <div
                      className="pointer-events-none absolute inset-0 rounded-2xl"
                      style={{
                        backgroundImage: `repeating-linear-gradient(0deg, rgba(37,99,235,0.10) 0, rgba(37,99,235,0.10) 1px, transparent 1px, transparent ${gridSize}px), repeating-linear-gradient(90deg, rgba(37,99,235,0.10) 0, rgba(37,99,235,0.10) 1px, transparent 1px, transparent ${gridSize}px)`,
                      }}
                    />
                    {/* Alignment guides */}
                    {guides.v !== null && (
                      <div
                        className="pointer-events-none absolute top-0 bottom-0"
                        style={{ left: guides.v, width: 1, background: '#ef4444' }}
                      />
                    )}
                    {guides.h !== null && (
                      <div
                        className="pointer-events-none absolute left-0 right-0"
                        style={{ top: guides.h, height: 1, background: '#ef4444' }}
                      />
                    )}
                    {/* Interaction overlay: one hit-box per element */}
                    {template.elements.map((el) => {
                      const isSel = el.id === selectedId;
                      const bounds = rotatedBoundingBox(el);
                      return (
                        <div
                          key={el.id}
                          onPointerDown={(e) => onPointerDown(e, el.id, 'move')}
                          style={{
                            position: 'absolute',
                            left: bounds.x,
                            top: bounds.y,
                            width: bounds.width,
                            height: bounds.height,
                            cursor: 'move',
                            background: isSel ? 'rgba(37,99,235,0.04)' : 'transparent',
                          }}
                        >
                          <div
                            className="pointer-events-none"
                            style={{
                              position: 'absolute',
                              left: bounds.width / 2 - el.width / 2,
                              top: bounds.height / 2 - el.height / 2,
                              width: el.width,
                              height: el.height,
                              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                              outline: isSel
                                ? '2px solid #2563eb'
                                : '1px dashed rgba(37,99,235,0.35)',
                              outlineOffset: 0,
                              background: isSel ? 'rgba(37,99,235,0.06)' : 'transparent',
                            }}
                          >
                            {isSel && (
                              <div
                                className="pointer-events-auto"
                                onPointerDown={(e) => onPointerDown(e, el.id, 'resize')}
                                style={{
                                  position: 'absolute',
                                  right: -5,
                                  bottom: -5,
                                  width: 10,
                                  height: 10,
                                  background: '#2563eb',
                                  borderRadius: 2,
                                  cursor: 'nwse-resize',
                                }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void handleSave()} disabled={busy}>
              {busy ? 'Збереження…' : 'Зберегти'}
            </Button>
            <Button variant="secondary" onClick={() => void handleReset()}>
              Скинути
            </Button>
            <Button variant="secondary" onClick={exportJson}>
              Експорт JSON
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen((v) => !v)}>
              Імпорт JSON
            </Button>
          </div>
          {importOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Вставте JSON макета…"
                className="h-32 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
              />
              <Button onClick={importJson}>Застосувати</Button>
            </div>
          )}
        </div>

        {/* ── Панель властивостей ── */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-3 text-sm font-semibold">Властивості поля</h2>
            {!selected ? (
              <p className="text-sm text-slate-400">
                Виберіть поле на картці, щоб редагувати його параметри.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-slate-500">
                  Тип:{' '}
                  <span className="font-medium text-slate-700">{TYPE_LABELS[selected.type]}</span>
                </p>

                {bindingOptions.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Джерело даних</span>
                    <select
                      value={selected.binding}
                      onChange={(e) => updateElement(selected.id, { binding: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    >
                      {bindingOptions.map((b) => (
                        <option key={b} value={b}>
                          {BINDING_LABELS[b] ?? b}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {selected.type === 'text' && selected.binding === 'custom' && (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">Текст (укр.)</span>
                      <input
                        value={selected.content ?? ''}
                        maxLength={200}
                        onChange={(e) => updateElement(selected.id, { content: e.target.value })}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">
                        Текст (англ.) — на англ. боці картки
                      </span>
                      <input
                        value={selected.contentEn ?? ''}
                        maxLength={200}
                        onChange={(e) => updateElement(selected.id, { contentEn: e.target.value })}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </label>
                  </>
                )}
                {(selected.binding === 'mediaId' || selected.type === 'date') && (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">
                        Підпис укр. (порожньо — стандартний)
                      </span>
                      <input
                        value={selected.content ?? ''}
                        maxLength={60}
                        onChange={(e) => updateElement(selected.id, { content: e.target.value })}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">
                        Підпис англ. (порожньо — стандартний)
                      </span>
                      <input
                        value={selected.contentEn ?? ''}
                        maxLength={60}
                        onChange={(e) => updateElement(selected.id, { contentEn: e.target.value })}
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </label>
                  </>
                )}
                {selected.type === 'image' && selected.binding === 'custom' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Шлях до зображення</span>
                    <input
                      value={selected.src ?? ''}
                      placeholder="/icons/logo.svg"
                      onChange={(e) => updateElement(selected.id, { src: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    />
                  </label>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'width', 'height'] as const).map((k) => {
                    // X/Y edit the rotated bounding-box top-left so the origin is
                    // always the visible top-left corner; W/H stay as-is.
                    const off = bboxOffset(selected);
                    const shown =
                      k === 'x'
                        ? selected.x + off.dx
                        : k === 'y'
                          ? selected.y + off.dy
                          : selected[k];
                    return (
                      <label key={k} className="flex flex-col gap-1">
                        <span className="text-xs uppercase text-slate-500">{k}</span>
                        <input
                          type="number"
                          value={Math.round(shown)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            const d = bboxOffset(selected);
                            if (k === 'x') updateElement(selected.id, { x: Math.round(v - d.dx) });
                            else if (k === 'y')
                              updateElement(selected.id, { y: Math.round(v - d.dy) });
                            else updateElement(selected.id, { [k]: v });
                          }}
                          className="rounded-lg border border-slate-300 px-2 py-1"
                        />
                      </label>
                    );
                  })}
                </div>

                {(selected.type === 'text' || selected.type === 'date') && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-500">Розмір</span>
                        <input
                          type="number"
                          min={6}
                          max={60}
                          value={selected.fontSize ?? 14}
                          onChange={(e) =>
                            updateElement(selected.id, { fontSize: Number(e.target.value) })
                          }
                          className="rounded-lg border border-slate-300 px-2 py-1"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-500">Колір</span>
                        <input
                          type="color"
                          value={selected.color ?? '#0f172a'}
                          onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                          className="h-8 w-full cursor-pointer rounded border border-slate-300"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => updateElement(selected.id, { bold: !selected.bold })}
                        className={`h-8 w-8 rounded-lg border font-bold ${selected.bold ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300'}`}
                      >
                        Ж
                      </button>
                      <button
                        onClick={() => updateElement(selected.id, { italic: !selected.italic })}
                        className={`h-8 w-8 rounded-lg border italic ${selected.italic ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300'}`}
                      >
                        К
                      </button>
                      <button
                        onClick={() =>
                          updateElement(selected.id, { uppercase: !selected.uppercase })
                        }
                        className={`h-8 rounded-lg border px-2 text-xs ${selected.uppercase ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300'}`}
                      >
                        ВЕЛ
                      </button>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">Вирівнювання</span>
                      <select
                        value={selected.align ?? 'left'}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            align: e.target.value as CardElement['align'],
                          })
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1"
                      >
                        <option value="left">зліва</option>
                        <option value="center">центр</option>
                        <option value="right">справа</option>
                      </select>
                    </label>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        Поворот: {selected.rotation ?? 0}°
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          title="Повернути вліво на 90°"
                          onClick={() =>
                            updateElement(selected.id, rotateKeepingBox(selected, -90))
                          }
                          className="h-8 w-8 rounded-lg border border-slate-300 hover:bg-slate-50"
                        >
                          ↺
                        </button>
                        <button
                          type="button"
                          title="Повернути вправо на 90°"
                          onClick={() => updateElement(selected.id, rotateKeepingBox(selected, 90))}
                          className="h-8 w-8 rounded-lg border border-slate-300 hover:bg-slate-50"
                        >
                          ↻
                        </button>
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">Фон поля</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={selected.bg ?? '#1d4ed8'}
                          onChange={(e) => updateElement(selected.id, { bg: e.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border border-slate-300"
                        />
                        {selected.bg && (
                          <button
                            onClick={() => updateElement(selected.id, { bg: undefined })}
                            className="text-xs text-slate-400 underline"
                          >
                            прибрати
                          </button>
                        )}
                      </div>
                    </label>
                  </>
                )}

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    onClick={duplicateSelected}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Дублювати
                  </button>
                  <button
                    onClick={() => reorder('front')}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    На передній план
                  </button>
                  <button
                    onClick={() => reorder('back')}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    На задній план
                  </button>
                  <button
                    onClick={removeSelected}
                    className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                  >
                    Видалити
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
