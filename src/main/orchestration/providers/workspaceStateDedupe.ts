/**
 * workspaceStateDedupe.ts — Per-thread cache for the <workspace_state> block.
 *
 * Wave 48 Phase C: resume turns re-serialize the same workspace_state every
 * turn (~300–400 tokens) even when nothing has changed. We cache a content
 * hash per thread and emit nothing when the new block matches the cached one.
 *
 * Cache size cap protects against an unbounded thread-id leak. Eviction is
 * pure LRU based on insertion order (Map preserves insertion order in JS).
 */

import { createHash } from 'crypto';

const MAX_THREADS = 100;

const lastSentHash = new Map<string, string>();

function hashBlock(block: string): string {
  return createHash('sha1').update(block).digest('hex');
}

function evictIfNeeded(): void {
  while (lastSentHash.size >= MAX_THREADS) {
    const oldest = lastSentHash.keys().next().value;
    if (oldest === undefined) return;
    lastSentHash.delete(oldest);
  }
}

/**
 * Returns true and records the new hash if the block differs from the
 * previously-sent block for `threadId`. Returns false when the block is
 * byte-identical and should be suppressed.
 *
 * Empty `threadId` always returns true (no caching key — fall through).
 */
export function shouldSendWorkspaceState(threadId: string | undefined, block: string): boolean {
  if (!threadId) return true;
  const next = hashBlock(block);
  const prev = lastSentHash.get(threadId);
  if (prev === next) return false;
  evictIfNeeded();
  lastSentHash.set(threadId, next);
  return true;
}

/** Drops the cached hash for a thread — call on session end. */
export function forgetThread(threadId: string): void {
  lastSentHash.delete(threadId);
}

/** Test helper. Not exposed at the module barrel. */
export function _resetWorkspaceStateDedupe(): void {
  lastSentHash.clear();
}
