import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';

import type { QrProjection } from './qr-token.service';

interface Entry {
  uuid: string;
  projection: QrProjection;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

/**
 * Short-lived in-memory store for a card's verify projection. The QR encodes
 * only a random id (kept tiny, so it scans reliably) instead of the whole
 * signed payload; the public verify endpoint looks the projection up by id.
 * Entries expire with the QR, so old codes stop verifying.
 */
@Injectable()
export class QrProjectionCacheService implements OnModuleDestroy {
  private readonly entries = new Map<string, Entry>();

  put(uuid: string, projection: QrProjection, ttlSeconds: number): string {
    const id = randomBytes(18).toString('base64url');
    const timer = setTimeout(() => this.remove(id), ttlSeconds * 1000);
    timer.unref();
    this.entries.set(id, { uuid, projection, expiresAt: Date.now() + ttlSeconds * 1000, timer });
    return id;
  }

  /** Returns the projection if the id is live and bound to this card uuid. */
  get(id: string | undefined, uuid: string): QrProjection | null {
    if (!id) return null;
    const entry = this.entries.get(id);
    if (!entry || entry.expiresAt <= Date.now() || entry.uuid !== uuid) return null;
    return entry.projection;
  }

  onModuleDestroy(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.entries.delete(id);
  }
}
