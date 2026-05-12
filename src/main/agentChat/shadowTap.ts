/**
 * shadowTap.ts — Module-level singleton holder for the DualEmitOrchestrator.
 *
 * Follows the same pattern as telemetry/outcomeObserver.ts (getOutcomeObserver).
 * The tap is optional; callers guard with `getShadowTap()?.onStreamJsonEvent(...)`.
 *
 * This module is the only place that holds the singleton reference.
 * It is set once at app start (after SQLite is open) and never replaced.
 *
 * Phase 3: shadow tap is active. Any error inside the orchestrator is swallowed
 * by DualEmitOrchestrator itself — this module never throws.
 */

import type { DualEmitOrchestrator } from './dualEmitOrchestrator';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _tap: DualEmitOrchestrator | null = null;

/** Set the active shadow tap. Call once at startup, after SQLite is open. */
export function setShadowTap(tap: DualEmitOrchestrator): void {
  _tap = tap;
}

/** Return the active shadow tap, or null if not yet initialized. */
export function getShadowTap(): DualEmitOrchestrator | null {
  return _tap;
}

/** Clear the tap (test teardown only). */
export function clearShadowTap(): void {
  _tap = null;
}
