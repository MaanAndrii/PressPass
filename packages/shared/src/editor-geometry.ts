/** Geometry helpers for the absolute card editor.
 *
 * Template JSON stores an element by its unrotated top-left (`x`, `y`) plus
 * `width`, `height` and a 90°-step `rotation`. All editor math below converts
 * to centre-based coordinates first because CSS rotates around the centre.
 */
export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Guides {
  v: number | null;
  h: number | null;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guides;
}

const RIGHT_ANGLE = 90;

export function normalizeRightAngle(rotation = 0): 0 | 90 | 180 | 270 {
  return ((((Math.round(rotation / RIGHT_ANGLE) * RIGHT_ANGLE) % 360) + 360) % 360) as
    0 | 90 | 180 | 270;
}

export function getElementCenter(rect: RectLike): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export const rectCenter = getElementCenter;

export function getRotatedBounds(rect: Pick<RectLike, 'width' | 'height' | 'rotation'>): Size {
  const rotation = normalizeRightAngle(rect.rotation);
  return rotation === 90 || rotation === 270
    ? { width: rect.height, height: rect.width }
    : { width: rect.width, height: rect.height };
}

export const rotatedBoundingSize = getRotatedBounds;

export function getBoundingBox(rect: RectLike): RectLike {
  const center = getElementCenter(rect);
  const size = getRotatedBounds(rect);
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
    rotation: 0,
  };
}

export const rotatedBoundingBox = getBoundingBox;

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export const snapValue = snapToGrid;

function topLeftFromCenter(center: Point, width: number, height: number): Point {
  return { x: center.x - width / 2, y: center.y - height / 2 };
}

export function clampToCanvas(rect: RectLike, canvas: Size): Point {
  const center = getElementCenter(rect);
  const bounds = getRotatedBounds(rect);
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  const clampedCenter = {
    x: Math.min(Math.max(center.x, halfW), canvas.width - halfW),
    y: Math.min(Math.max(center.y, halfH), canvas.height - halfH),
  };
  return topLeftFromCenter(clampedCenter, rect.width, rect.height);
}

export const clampElementToCanvas = clampToCanvas;

export function snapToCanvas(rect: RectLike, canvas: Size, threshold: number): SnapResult {
  const bounds = getBoundingBox(rect);
  const center = getElementCenter(rect);
  const guides: Guides = { v: null, h: null };
  const nextCenter = { ...center };

  if (Math.abs(bounds.x + bounds.width / 2 - canvas.width / 2) < threshold) {
    nextCenter.x += canvas.width / 2 - (bounds.x + bounds.width / 2);
    guides.v = canvas.width / 2;
  } else if (Math.abs(bounds.x) < threshold) {
    nextCenter.x -= bounds.x;
    guides.v = 0;
  } else if (Math.abs(bounds.x + bounds.width - canvas.width) < threshold) {
    nextCenter.x += canvas.width - (bounds.x + bounds.width);
    guides.v = canvas.width;
  }

  if (Math.abs(bounds.y + bounds.height / 2 - canvas.height / 2) < threshold) {
    nextCenter.y += canvas.height / 2 - (bounds.y + bounds.height / 2);
    guides.h = canvas.height / 2;
  } else if (Math.abs(bounds.y) < threshold) {
    nextCenter.y -= bounds.y;
    guides.h = 0;
  } else if (Math.abs(bounds.y + bounds.height - canvas.height) < threshold) {
    nextCenter.y += canvas.height - (bounds.y + bounds.height);
    guides.h = canvas.height;
  }

  const snapped = { ...rect, ...topLeftFromCenter(nextCenter, rect.width, rect.height) };
  const clamped = clampToCanvas(snapped, canvas);
  return { ...clamped, guides };
}

export const snapAndClampElement = snapToCanvas;

export function moveElement(
  start: RectLike,
  delta: Point,
  canvas: Size,
  gridSize: number,
  threshold: number,
): SnapResult {
  const next = {
    ...start,
    x: snapValue(start.x + delta.x, gridSize),
    y: snapValue(start.y + delta.y, gridSize),
  };
  return snapToCanvas(next, canvas, threshold);
}

function axes(rotation: number): { widthAxis: Point; heightAxis: Point } {
  switch (normalizeRightAngle(rotation)) {
    case 90:
      return { widthAxis: { x: 0, y: 1 }, heightAxis: { x: -1, y: 0 } };
    case 180:
      return { widthAxis: { x: -1, y: 0 }, heightAxis: { x: 0, y: -1 } };
    case 270:
      return { widthAxis: { x: 0, y: -1 }, heightAxis: { x: 1, y: 0 } };
    case 0:
    default:
      return { widthAxis: { x: 1, y: 0 }, heightAxis: { x: 0, y: 1 } };
  }
}

export function resizeElementFromBottomRight(
  start: RectLike,
  delta: Point,
  canvas: Size,
  gridSize: number,
  minSize = 8,
): RectLike {
  const { widthAxis, heightAxis } = axes(start.rotation ?? 0);
  const dw = delta.x * widthAxis.x + delta.y * widthAxis.y;
  const dh = delta.x * heightAxis.x + delta.y * heightAxis.y;
  const width = Math.max(minSize, snapValue(start.width + dw, gridSize));
  const height = Math.max(minSize, snapValue(start.height + dh, gridSize));
  const startCenter = getElementCenter(start);
  const anchor = {
    x: startCenter.x - (widthAxis.x * start.width) / 2 - (heightAxis.x * start.height) / 2,
    y: startCenter.y - (widthAxis.y * start.width) / 2 - (heightAxis.y * start.height) / 2,
  };
  const center = {
    x: anchor.x + (widthAxis.x * width) / 2 + (heightAxis.x * height) / 2,
    y: anchor.y + (widthAxis.y * width) / 2 + (heightAxis.y * height) / 2,
  };
  const unclamped = { ...start, ...topLeftFromCenter(center, width, height), width, height };
  return { ...unclamped, ...clampToCanvas(unclamped, canvas) };
}
