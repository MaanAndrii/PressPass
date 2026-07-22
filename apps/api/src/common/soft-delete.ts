/**
 * Soft-delete grace window shared by the login auto-restore path and the
 * background purge. A soft-deleted account or membership is hidden immediately
 * but only removed for good once its tombstone is older than this window.
 */
export const SOFT_DELETE_GRACE_DAYS = 7;
export const SOFT_DELETE_GRACE_MS = SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000;

/** True while a tombstone is still inside the grace window (i.e. restorable). */
export function isWithinGraceWindow(deletedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - deletedAt.getTime() < SOFT_DELETE_GRACE_MS;
}
