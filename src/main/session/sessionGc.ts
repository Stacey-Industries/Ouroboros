/**
 * sessionGc.ts — GC task for archived sessions.
 *
 * Purges archived sessions whose archivedAt + 7 days < now.
 * Purge = delete the trash JSON file + remove from the store.
 *
 * Startup: call runSessionGc(Date.now()) once from sessionStartup.ts.
 * Interval: register setInterval(() => runSessionGc(Date.now()), WEEK_MS)
 * and clear on app quit.
 */

import log from '../logger';
import type { Session } from './session';
import { getSessionStore } from './sessionStore';
import type { TrashAdaptor } from './sessionTrash';
import { deleteFromTrash } from './sessionTrash';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

// ─── GC result ────────────────────────────────────────────────────────────────

export interface GcResult {
  purged: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isExpired(session: Session, now: number): boolean {
  if (!session.archivedAt) return false;
  return new Date(session.archivedAt).getTime() + SEVEN_DAYS_MS < now;
}

async function purgeOne(
  session: Session,
  trashAdaptor: TrashAdaptor | undefined,
): Promise<void> {
  const store = getSessionStore();
  if (store) store.delete(session.id);
  if (trashAdaptor) {
    await deleteFromTrash(session.id, trashAdaptor);
  } else {
    // Production: use default adaptor (lazy-requires electron)
    await deleteFromTrash(session.id);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run GC against the current session store.
 *
 * @param now  - Current epoch ms (pass Date.now() in production; use fake time in tests).
 * @param trashAdaptor - Optional injected adaptor for test isolation.
 */
export async function runSessionGc(
  now: number,
  trashAdaptor?: TrashAdaptor,
): Promise<GcResult> {
  const store = getSessionStore();
  if (!store) return { purged: 0 };

  const all = store.listAll();
  const expired = all.filter((s) => isExpired(s, now));

  for (const session of expired) {
    try {
      await purgeOne(session, trashAdaptor);
    } catch (err) {
      log.error('[sessionGc] purge failed for', session.id, err);
    }
  }

  if (expired.length > 0) {
    log.info('[sessionGc] purged', expired.length, 'expired sessions');
  }

  return { purged: expired.length };
}
