import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';
interface Item {
  bytes: Buffer;
  mimeType: string;
  expiresAt: number;
  timer: NodeJS.Timeout;
}
@Injectable()
export class PublicMediaCacheService implements OnModuleDestroy {
  private readonly items = new Map<string, Item>();
  put(bytes: Buffer, mimeType: string, ttlSeconds: number): string {
    const id = randomBytes(24).toString('base64url');
    const timer = setTimeout(() => this.remove(id), ttlSeconds * 1000);
    timer.unref();
    this.items.set(id, {
      bytes: Buffer.from(bytes),
      mimeType,
      expiresAt: Date.now() + ttlSeconds * 1000,
      timer,
    });
    return id;
  }
  take(id: string): { bytes: Buffer; mimeType: string } | null {
    const item = this.items.get(id);
    if (!item || item.expiresAt <= Date.now()) {
      this.remove(id);
      return null;
    }
    return { bytes: Buffer.from(item.bytes), mimeType: item.mimeType };
  }
  onModuleDestroy(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
  }
  private remove(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    item.bytes.fill(0);
    this.items.delete(id);
  }
}
