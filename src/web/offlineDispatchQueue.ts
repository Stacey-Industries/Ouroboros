/**
 * offlineDispatchQueue.ts — Wave 34 Phase G.
 *
 * Persists DispatchRequest objects to localStorage when the desktop is
 * offline, so they can be replayed on reconnect.
 *
 * - Cap: 10 entries. enqueueOfflineDispatch returns { error: 'queue-full' }
 *   when the cap is exceeded.
 * - Each entry has a uuid used as clientRequestId for idempotent replay.
 * - drainOfflineDispatches iterates the queue and calls the provided send
 *   function. The send result drives whether the entry is kept or removed.
 */

import type { DispatchRequest } from '../renderer/types/electron-dispatch';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ouroboros.offlineDispatchQueue';
const MAX_QUEUE_SIZE = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueuedOfflineDispatch {
  /** UUID — used as clientRequestId for idempotent replay. */
  id: string;
  request: DispatchRequest;
  /** ISO 8601 timestamp. */
  queuedAt: string;
}

export type EnqueueResult = QueuedOfflineDispatch | { error: 'queue-full' };

export interface DrainResult {
  sent: number;
  failed: number;
  /** Entries the server already processed (duplicate clientRequestId). */
  lost: number;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function readQueue(): QueuedOfflineDispatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedOfflineDispatch[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedOfflineDispatch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Quota errors should not crash the dispatch flow.
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Add a dispatch request to the offline queue.
 * Returns the queued entry (with generated uuid as id) or { error: 'queue-full' }.
 */
export async function enqueueOfflineDispatch(
  req: DispatchRequest,
): Promise<EnqueueResult> {
  const queue = readQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    return { error: 'queue-full' };
  }
  const entry: QueuedOfflineDispatch = {
    id: crypto.randomUUID(),
    request: { ...req, clientRequestId: crypto.randomUUID() },
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...queue, entry]);
  return entry;
}

/** Return all currently queued offline dispatches. */
export async function listOfflineDispatches(): Promise<QueuedOfflineDispatch[]> {
  return readQueue();
}

/**
 * Remove a specific queued entry by id.
 */
export async function clearOfflineDispatch(id: string): Promise<void> {
  const queue = readQueue().filter((e) => e.id !== id);
  writeQueue(queue);
}

/**
 * Drain the offline queue by calling send(entry) for each entry.
 *
 * send(entry) semantics:
 *  - Returns true  → success, remove from queue, increment sent.
 *  - Returns false → keep in queue (transient failure), increment failed.
 *  - Throws with message 'duplicate' → server already processed, remove, increment lost.
 */
export async function drainOfflineDispatches(
  send: (d: QueuedOfflineDispatch) => Promise<boolean>,
): Promise<DrainResult> {
  const queue = readQueue();
  let sent = 0;
  let failed = 0;
  let lost = 0;

  for (const entry of queue) {
    try {
      const ok = await send(entry);
      if (ok) {
        await clearOfflineDispatch(entry.id);
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'duplicate') {
        await clearOfflineDispatch(entry.id);
        lost++;
      } else {
        failed++;
      }
    }
  }

  return { sent, failed, lost };
}
