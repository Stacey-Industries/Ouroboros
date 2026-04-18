/**
 * capabilityGate.ts — pure capability check for mobile WS requests.
 *
 * Wave 33a Phase C.
 *
 * Rules (fail-closed):
 *  - Channel not in catalog  → denied, reason 'unclassified'
 *  - class === 'always'      → allowed unconditionally
 *  - class === 'desktop-only'→ denied, reason 'desktop-only'
 *  - otherwise               → allowed iff deviceCapabilities includes the class
 *
 * No side effects. No logging at this layer — callers log denials.
 */

import { CATALOG_LOOKUP } from './channelCatalog';
import type { Capability } from './types';

// ─── Timeout constants ────────────────────────────────────────────────────────

const TIMEOUT_MS: Record<import('./types').TimeoutClass, number> = {
  short:  10_000,
  normal: 30_000,
  long:   120_000,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CapabilityCheckInput {
  channel: string;
  deviceCapabilities: readonly Capability[];
}

export interface CapabilityCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check whether a given channel is permitted for a device capability set.
 * Pure function — no side effects, no I/O.
 */
export function checkCapability(
  input: CapabilityCheckInput,
): CapabilityCheckResult {
  const { channel, deviceCapabilities } = input;

  const entry = CATALOG_LOOKUP.get(channel);
  if (!entry) {
    return { allowed: false, reason: 'unclassified' };
  }

  if (entry.class === 'always') {
    return { allowed: true };
  }

  if (entry.class === 'desktop-only') {
    return { allowed: false, reason: 'desktop-only' };
  }

  const permitted = deviceCapabilities.includes(entry.class);
  return permitted
    ? { allowed: true }
    : { allowed: false, reason: `requires:${entry.class}` };
}

/**
 * Returns true when a channel's class is resumable (paired-read or paired-write).
 * 'always' and 'desktop-only' channels are fire-and-reject on disconnect.
 * Wave 33a Phase E.
 */
export function isResumable(channel: string): boolean {
  const entry = CATALOG_LOOKUP.get(channel);
  return entry?.class === 'paired-read' || entry?.class === 'paired-write';
}

/**
 * Returns the timeout in milliseconds for the channel's timeout class.
 * Defaults to 'normal' (30 s) for unclassified channels — the gate will
 * reject them anyway, but callers may need a timeout value for logging.
 */
export function getTimeoutMs(channel: string): number {
  const entry = CATALOG_LOOKUP.get(channel);
  const cls = entry?.timeoutClass ?? 'normal';
  // eslint-disable-next-line security/detect-object-injection -- cls is a TimeoutClass literal from catalog, not user input
  return TIMEOUT_MS[cls];
}
