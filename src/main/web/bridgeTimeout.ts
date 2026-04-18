/**
 * bridgeTimeout.ts — Per-call-class timeout wrapper for WS bridge handlers.
 *
 * Wave 33a Phase F.
 *
 * Provides withTimeout<T>() which races a handler promise against the
 * channel's class-derived budget (short=10s, normal=30s, long=120s).
 *
 * On timeout:
 *  - Rejects with a TimeoutError carrying the channel name + budget.
 *  - If the underlying handler resolves after the budget fires, the result
 *    is discarded silently (logged at info level).
 *
 * Double-response prevention:
 *  - A `settled` flag is set on the FIRST resolution path (result or timeout).
 *    Whichever fires second is ignored. This is safe because the timeout
 *    rejection does NOT cancel the underlying promise (JS has no cancellation
 *    primitive) — so both paths may eventually fire.
 */

import log from '../logger';
import { getTimeoutMs } from '../mobileAccess/capabilityGate';
import { incrementTimeout } from '../mobileAccess/timeoutMetrics';

// ─── Error type ────────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(
    public readonly channel: string,
    public readonly budgetMs: number,
  ) {
    super(`Handler timeout after ${budgetMs}ms: ${channel}`);
    this.name = 'TimeoutError';
  }
}

// ─── Core wrapper ──────────────────────────────────────────────────────────────

/**
 * Race `promise` against the timeout budget for `channel`.
 *
 * Resolves with the promise result if it completes within budget.
 * Rejects with TimeoutError if the budget elapses first.
 */
export function withTimeout<T>(promise: Promise<T>, channel: string): Promise<T> {
  const budgetMs = getTimeoutMs(channel);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    function settle(fn: () => void): void {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      fn();
    }

    timer = setTimeout(() => {
      settle(() => {
        incrementTimeout(channel);
        reject(new TimeoutError(channel, budgetMs));
      });
      // Late handler resolution will arrive after settle — log and discard.
      promise.then(
        (result) => {
          if (settled) {
            log.info(
              `[bridgeTimeout] late result discarded for ${channel}`,
              `(resolved ${budgetMs}ms after budget)`,
            );
          }
          return result;
        },
        () => { /* discard late errors too */ },
      );
    }, budgetMs);

    promise.then(
      (result) => settle(() => resolve(result)),
      (err: unknown) => settle(() => reject(err)),
    );
  });
}
