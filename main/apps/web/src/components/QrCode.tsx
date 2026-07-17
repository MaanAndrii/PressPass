'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * Renders a QR code for the given value (the card's public verify URL).
 * The QR contains only the URL — never personal data.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch((error) => console.error('QR generation failed:', error));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded-lg bg-slate-200"
        style={{ width: size, height: size }}
      />
    );
  }

  return <img src={dataUrl} alt="QR-код для перевірки посвідчення" width={size} height={size} />;
}
