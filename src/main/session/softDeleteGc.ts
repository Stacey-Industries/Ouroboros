/**
 * softDeleteGc.ts — GC task for soft-deleted sessions and threads.
 *
 * Purges entities whose deletedAt + 30 days < now.
 * Separate from sessionGc.ts (7-day archive GC) — different grace period.
 *
 * Pure function with injected dependencies (no direct Electron imports).
 */

import type { AgentChatThreadStore } from '../agentChat/threadStore';
import log from '../logger';
import type { SessionStore } from './sessionStore';

// ─── Constants ────────────────────────────────────────────────────────────────

export const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

// ─── Result ───────────────────────────────────────────────────────────────────

export interface SoftDeleteGcResult {
  purgedSessions: number;
  purgedThreads: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the 30-day soft-delete GC pass.
 *
 * @param now         - Current epoch ms.
 * @param store       - Session store instance.
 * @param threadStore - Thread store instance (may be null if not yet initialised).
 */
export async function runSoftDeleteGc(
  now: number,
  store: SessionStore | null,
  threadStore: AgentChatThreadStore | null,
): Promise<SoftDeleteGcResult> {
  const result: SoftDeleteGcResult = { purgedSessions: 0, purgedThreads: 0 };

  result.purgedSessions = purgeSessions(store, now);
  result.purgedThreads = await purgeThreads(threadStore, now);

  if (result.purgedSessions > 0 || result.purgedThreads > 0) {
    log.info(
      '[softDeleteGc] purged',
      result.purgedSessions,
      'sessions,',
      result.purgedThreads,
      'threads',
    );
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isExpiredDelete(deletedAt: number | undefined, now: number): boolean {
  if (deletedAt === undefined) return false;
  return deletedAt + THIRTY_DAYS_MS < now;
}

function purgeSessions(store: SessionStore | null, now: number): number {
  if (!store) return 0;
  const all = store.listAll();
  const expired = all.filter((s) => isExpiredDelete(s.deletedAt, now));
  for (const s of expired) {
    try {
      store.delete(s.id);
    } catch (err) {
      log.error('[softDeleteGc] session purge failed:', s.id, err);
    }
  }
  return expired.length;
}

async function purgeThreads(
  threadStore: AgentChatThreadStore | null,
  now: number,
): Promise<number> {
  if (!threadStore) return 0;
  let count = 0;
  try {
    const threads = await threadStore.listThreads();
    const expired = threads.filter((t) => isExpiredDelete(t.deletedAt, now));
    for (const t of expired) {
      try {
        await threadStore.deleteThread(t.id);
        count++;
      } catch (err) {
        log.error('[softDeleteGc] thread purge failed:', t.id, err);
      }
    }
  } catch (err) {
    log.error('[softDeleteGc] listThreads failed:', err);
  }
  return count;
}
