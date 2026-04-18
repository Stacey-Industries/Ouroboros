/**
 * timeoutMetrics.ts — In-memory per-class timeout counters.
 *
 * Wave 33a Phase F.
 *
 * Diagnostic only. Exposes via mobileAccess:getTimeoutStats IPC.
 * Counters reset on process restart (intentional — this is a live-ops view).
 */

import { CATALOG_LOOKUP } from './channelCatalog';
import type { TimeoutClass } from './types';

// ─── State ────────────────────────────────────────────────────────────────────

export interface TimeoutStats {
  short: number;
  normal: number;
  long: number;
}

const counters: TimeoutStats = { short: 0, normal: 0, long: 0 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classForChannel(channel: string): TimeoutClass {
  return CATALOG_LOOKUP.get(channel)?.timeoutClass ?? 'normal';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Increment the timeout counter for the class the channel belongs to.
 * Called by bridgeTimeout.ts when a handler exceeds its budget.
 */
export function incrementTimeout(channel: string): void {
  const cls = classForChannel(channel);
  // eslint-disable-next-line security/detect-object-injection -- cls is a TimeoutClass literal, not user input
  counters[cls]++;
}

/**
 * Returns a snapshot of current timeout counts per class.
 * Safe to call from any thread/process context — counters are main-process state.
 */
export function getTimeoutStats(): TimeoutStats {
  return { ...counters };
}

/**
 * Reset all counters. For testing only.
 * @internal
 */
export function resetTimeoutStats(): void {
  counters.short = 0;
  counters.normal = 0;
  counters.long = 0;
}
