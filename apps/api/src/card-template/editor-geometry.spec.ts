import {
  clampElementToCanvas,
  moveElement,
  rotatedBoundingBox,
  snapAndClampElement,
} from '@presspass/shared';

describe('editor geometry', () => {
  const canvas = { width: 360, height: 640 };

  it('keeps the bounding box unchanged at 0°', () => {
    expect(rotatedBoundingBox({ x: 20, y: 30, width: 100, height: 40, rotation: 0 })).toEqual({
      x: 20,
      y: 30,
      width: 100,
      height: 40,
      rotation: 0,
    });
  });

  it('swaps visual width and height around the centre at 90°', () => {
    expect(rotatedBoundingBox({ x: 20, y: 30, width: 100, height: 40, rotation: 90 })).toEqual({
      x: 50,
      y: 0,
      width: 40,
      height: 100,
      rotation: 0,
    });
  });

  it('clamps rotated elements near each canvas edge', () => {
    expect(
      clampElementToCanvas({ x: -50, y: 100, width: 100, height: 20, rotation: 0 }, canvas),
    ).toEqual({
      x: 0,
      y: 100,
    });
    expect(
      clampElementToCanvas({ x: 340, y: 100, width: 100, height: 20, rotation: 0 }, canvas),
    ).toEqual({
      x: 260,
      y: 100,
    });
    expect(
      clampElementToCanvas({ x: 100, y: -50, width: 100, height: 20, rotation: 90 }, canvas),
    ).toEqual({
      x: 100,
      y: 40,
    });
    expect(
      clampElementToCanvas({ x: 100, y: 620, width: 100, height: 20, rotation: 90 }, canvas),
    ).toEqual({
      x: 100,
      y: 580,
    });
  });

  it('snaps to the horizontal and vertical centre guides', () => {
    const result = snapAndClampElement(
      { x: 131, y: 270, width: 100, height: 100, rotation: 0 },
      canvas,
      6,
    );
    expect(result).toEqual({ x: 130, y: 270, guides: { v: 180, h: 320 } });
  });

  it('moves a narrow text field rotated by 90° to the visual left and right edges', () => {
    const start = { x: 160, y: 260, width: 160, height: 20, rotation: 90 };
    const left = moveElement(start, { x: -250, y: 0 }, canvas, 1, 6);
    expect(left.x).toBe(-70);
    expect(rotatedBoundingBox({ ...start, x: left.x, y: left.y }).x).toBe(0);

    const right = moveElement(start, { x: 250, y: 0 }, canvas, 1, 6);
    expect(right.x).toBe(270);
    expect(rotatedBoundingBox({ ...start, x: right.x, y: right.y }).x + 20).toBe(360);
  });
});
