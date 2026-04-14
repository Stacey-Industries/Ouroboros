/**
 * approvalWaiterRegistry.ts — Waiter registry for the approval.wait pipe-handshake.
 *
 * Hook scripts call `approval.wait(requestId, timeoutMs)` over the ideToolServer
 * NDJSON pipe instead of polling the filesystem at 500ms intervals.
 * This module tracks the in-flight waiters and provides resolution + cancellation.
 */

import type { ApprovalResponse } from './approvalManager';
import log from './logger';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApprovalWaiter {
  resolve: (response: ApprovalResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Module state ─────────────────────────────────────────────────────────────

/** Active pipe waiters blocked on approval.wait — resolved by notifyWaiters. */
const waiters = new Map<string, Set<ApprovalWaiter>>();

/**
 * Recent resolutions cache — handles the race where the pipe caller calls
 * waitForResolution AFTER the resolution already fired.
 * TTL: 5 seconds.
 */
const recentResolutions = new Map<string, { response: ApprovalResponse; expiresAt: number }>();
const RECENT_RESOLUTION_TTL_MS = 5_000;

function pruneRecentResolutions(): void {
  const now = Date.now();
  for (const [id, entry] of recentResolutions) {
    if (entry.expiresAt < now) recentResolutions.delete(id);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called by approvalManager.notifyApprovalResolved to wake all pipe waiters
 * for the given requestId.
 */
export function notifyWaiters(requestId: string, response: ApprovalResponse): void {
  const waiterSet = waiters.get(requestId);
  if (waiterSet) {
    for (const waiter of waiterSet) {
      clearTimeout(waiter.timer);
      waiter.resolve(response);
    }
    waiters.delete(requestId);
  }

  pruneRecentResolutions();
  recentResolutions.set(requestId, { response, expiresAt: Date.now() + RECENT_RESOLUTION_TTL_MS });
}

/**
 * Block until the approval for `requestId` is resolved, or reject after `timeoutMs`.
 *
 * Race-safe: if the resolution already fired (within the recent-resolutions TTL),
 * returns immediately without registering a waiter.
 *
 * Cleanup: callers must invoke the returned `cancel` function when the pipe
 * connection drops to prevent a waiter leak.
 */
export function waitForResolution(
  requestId: string,
  timeoutMs: number,
): { promise: Promise<ApprovalResponse>; cancel: () => void } {
  const cached = recentResolutions.get(requestId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      promise: Promise.resolve(cached.response),
      cancel: () => { /* no-op — already resolved */ },
    };
  }

  let waiterRef: ApprovalWaiter | null = null;

  const promise = new Promise<ApprovalResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      const waiterSet = waiters.get(requestId);
      if (waiterSet && waiterRef) waiterSet.delete(waiterRef);
      if (waiterSet?.size === 0) waiters.delete(requestId);
      reject(new Error(`approval.wait timed out after ${timeoutMs}ms for ${requestId}`));
    }, timeoutMs);

    waiterRef = { resolve, reject, timer };

    let waiterSet = waiters.get(requestId);
    if (!waiterSet) {
      waiterSet = new Set();
      waiters.set(requestId, waiterSet);
    }
    waiterSet.add(waiterRef);
  });

  const cancel = (): void => {
    if (!waiterRef) return;
    clearTimeout(waiterRef.timer);
    const waiterSet = waiters.get(requestId);
    if (waiterSet) {
      waiterSet.delete(waiterRef);
      if (waiterSet.size === 0) waiters.delete(requestId);
    }
    log.info(`[approval.wait] waiter cancelled for ${requestId} (connection dropped)`);
    waiterRef = null;
  };

  return { promise, cancel };
}
