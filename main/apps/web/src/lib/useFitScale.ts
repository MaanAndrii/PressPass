'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Uniformly scales a fixed-size card (width × height) to fit the available
 * space of the returned `ref` element, keeping the aspect ratio. The card is
 * rendered at its intrinsic size and transformed by `scale`, so the header,
 * footer and body zones always keep their proportions on any screen.
 */
export function useFitScale(width: number, height: number, max = 2) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    // clientWidth/Height ignore any overflowing (un-scaled) child, so the
    // available space is measured correctly even before the scale converges.
    const aw = el.clientWidth;
    const ah = el.clientHeight;
    if (aw === 0 || ah === 0) {
      return;
    }
    setScale(Math.min(aw / width, ah / height, max));
  }, [width, height, max]);

  useLayoutEffect(() => {
    measure();
    // Re-measure after paint and shortly after: sibling elements (e.g. a hint
    // line shown once the QR loads) can change the available height a beat
    // later, and a ResizeObserver alone may miss the settled layout.
    const raf = requestAnimationFrame(measure);
    const timers = [80, 300, 700].map((t) => window.setTimeout(measure, t));
    const el = ref.current;
    const ro = new ResizeObserver(measure);
    if (el) {
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return { ref, scale };
}
