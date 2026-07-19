import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface UnlockEntry {
  userId: number;
  keys: Map<string, Buffer>;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

@Injectable()
export class UnlockSessionService implements OnModuleDestroy {
  private readonly sessions = new Map<string, UnlockEntry>();
  private readonly ttlMs = 15 * 60 * 1000;

  create(userId: number, keys: ReadonlyMap<string, Buffer>): { token: string; expiresAt: string } {
    this.revokeUser(userId);
    const token = randomBytes(32).toString('base64url');
    const copy = new Map([...keys].map(([name, key]) => [name, Buffer.from(key)]));
    const expiresAt = Date.now() + this.ttlMs;
    const timer = setTimeout(() => this.revoke(token), this.ttlMs);
    timer.unref();
    this.sessions.set(token, { userId, keys: copy, expiresAt, timer });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  key(token: string, userId: number, name: string): Buffer {
    this.sweep();
    const entry = this.sessions.get(token);
    if (!entry || entry.userId !== userId) throw new Error('Unlock session is invalid or expired');
    const key = entry.keys.get(name);
    if (!key) throw new Error('Requested key is not unlocked');
    return Buffer.from(key);
  }

  /**
   * Adds (or replaces) a key in an existing session. Used when a new owner key
   * is provisioned mid-session — e.g. a Superadmin creating an editorial — so the
   * same unlock can immediately read/write it without a re-login. A private copy
   * is stored, so the caller may wipe its own buffer. No-op if the session is
   * gone (the next unlock rebuilds the full set from the database).
   */
  put(token: string, userId: number, name: string, key: Buffer): void {
    this.sweep();
    const entry = this.sessions.get(token);
    if (!entry || entry.userId !== userId) return;
    entry.keys.set(name, Buffer.from(key));
  }

  sharedKey(name: string): Buffer {
    this.sweep();
    for (const entry of this.sessions.values()) {
      const key = entry.keys.get(name);
      if (key) return Buffer.from(key);
    }
    throw new Error('Requested owner key is not currently unlocked');
  }

  revoke(token: string): void {
    const entry = this.sessions.get(token);
    if (entry) this.destroy(entry);
    this.sessions.delete(token);
  }
  revokeUser(userId: number): void {
    for (const [token, entry] of this.sessions) if (entry.userId === userId) this.revoke(token);
  }
  onModuleDestroy(): void {
    for (const token of [...this.sessions.keys()]) this.revoke(token);
  }
  private sweep(): void {
    for (const [token, entry] of this.sessions)
      if (entry.expiresAt <= Date.now()) this.revoke(token);
  }
  private destroy(entry: UnlockEntry): void {
    clearTimeout(entry.timer);
    for (const key of entry.keys.values()) key.fill(0);
    entry.keys.clear();
  }
}
