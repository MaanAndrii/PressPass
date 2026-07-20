'use client';

/**
 * Device-bound storage of the journalist's profile data key (DEK) for the PWA
 * "stay signed in" flow (Variant B). The DEK is wrapped with a **non-extractable**
 * AES-GCM key generated on the device (WebCrypto) and kept in IndexedDB; the wrap
 * key itself can never be read back out of the browser, so even injected script
 * cannot exfiltrate the raw device key. The wrapped DEK re-establishes the short
 * server-side unlock session on each app open — no password re-entry.
 *
 * Trade-off (chosen deliberately): whoever can unlock the phone can open the
 * card. There is no separate app PIN.
 */
const DB_NAME = 'presspass';
const STORE = 'device';
const WRAP_KEY_ID = 'wrapKey';
const WRAPPED_DEK_ID = 'wrappedDek';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as T | undefined);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function usable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle
  );
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Whether this device has a remembered profile key. */
export async function hasDeviceKey(): Promise<boolean> {
  if (!usable()) return false;
  try {
    return Boolean(await idbGet<ArrayBuffer>(WRAPPED_DEK_ID));
  } catch {
    return false;
  }
}

/** Remembers the profile DEK (base64) wrapped under a fresh non-extractable key. */
export async function rememberDeviceKey(dekBase64: string): Promise<void> {
  if (!usable()) return;
  const wrapKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    b64ToBytes(dekBase64) as BufferSource,
  );
  await idbSet(WRAP_KEY_ID, wrapKey); // CryptoKey stored by structured clone; non-extractable
  await idbSet(WRAPPED_DEK_ID, { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) });
}

/** Recovers the remembered profile DEK (base64), or null when none/failed. */
export async function recoverDeviceKey(): Promise<string | null> {
  if (!usable()) return null;
  try {
    const wrapKey = await idbGet<CryptoKey>(WRAP_KEY_ID);
    const wrapped = await idbGet<{ iv: string; ct: string }>(WRAPPED_DEK_ID);
    if (!wrapKey || !wrapped) return null;
    const dek = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(wrapped.iv) as BufferSource },
      wrapKey,
      b64ToBytes(wrapped.ct) as BufferSource,
    );
    return bytesToB64(new Uint8Array(dek));
  } catch {
    return null;
  }
}

/** Forgets the remembered key (on logout / when the key is rejected). */
export async function forgetDeviceKey(): Promise<void> {
  if (!usable()) return;
  try {
    await idbDelete(WRAP_KEY_ID);
    await idbDelete(WRAPPED_DEK_ID);
  } catch {
    // best-effort
  }
}
