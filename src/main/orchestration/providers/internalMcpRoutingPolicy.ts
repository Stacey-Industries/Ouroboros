/**
 * internalMcpRoutingPolicy.ts — Wave 51 Phase C.
 *
 * Pure decision module for per-spawn internalMcp ("ouroboros") routing.
 *
 * Three outcomes:
 *   - 'direct-inject'           — write {ouroboros: <entry>} into the spawn's
 *                                 scoped MCP config (today's behavior).
 *   - 'route-through-codemode'  — omit ouroboros from the scoped config; CodeMode's
 *                                 __codemode_proxy entry already surfaces the
 *                                 graph tools as `servers.ouroboros.*` inside
 *                                 `execute_code`.
 *   - 'omit'                    — internalMcp is gated off for this spawn (scope
 *                                 'never' or task-gated + non-graph task).
 *
 * The decision is a pure function of:
 *   codemodeEnabled       — `codemode.enabled` config (Phase B added)
 *   ouroborosExcludedFromMultiplex — true when 'ouroboros' is listed in
 *                           `codemode.excludeFromMultiplex`. Wave 53l Phase B
 *                           replaced the old `routeInternalMcp` per-spawn
 *                           opt-in: with user-level CodeMode multiplexing
 *                           every user-registered server by default, the
 *                           per-server toggle is the exclusion list.
 *   internalMcpScope      — `internalMcpScope` from Wave 48
 *   taskNeedsGraphTools   — derived from Wave 48 goal classification (true when
 *                           task-gated would inject)
 *
 * No I/O, no logger, no side effects: callers compose this with their own
 * config reads + crash-recovery downgrade. See `claudeCodeMode.ts` for the
 * place where a failed `enableCodeMode` downgrades the consumed decision back
 * to 'direct-inject'.
 */

import type { InternalMcpScope } from '../../internalMcp/internalMcpScope';

export type RoutingDecision = 'direct-inject' | 'route-through-codemode' | 'omit';

export interface RoutingInputs {
  codemodeEnabled: boolean;
  /**
   * Wave 53l Phase B — true when 'ouroboros' appears in
   * `codemode.excludeFromMultiplex`. Replaces the old `routeInternalMcp`
   * per-spawn opt-in: user-level CodeMode multiplexes every server by
   * default, and exclusion is the per-server escape hatch.
   */
  ouroborosExcludedFromMultiplex: boolean;
  internalMcpScope: InternalMcpScope;
  /** Wave 48 task signal — `true` when the spawn's goal is code-shaped (or scope='always'). */
  taskNeedsGraphTools: boolean;
}

/** Hard gate: scope='never' or task-gated without a graph-shaped task → omit. */
function isOmitted(inputs: RoutingInputs): boolean {
  if (inputs.internalMcpScope === 'never') return true;
  if (inputs.internalMcpScope === 'task-gated' && !inputs.taskNeedsGraphTools) return true;
  return false;
}

function isRoutedThroughCodemode(inputs: RoutingInputs): boolean {
  if (!inputs.codemodeEnabled) return false;
  if (inputs.ouroborosExcludedFromMultiplex) return false;
  return true;
}

/**
 * Decide the per-spawn routing outcome. See module header for the matrix.
 */
export function decideInternalMcpRouting(inputs: RoutingInputs): RoutingDecision {
  if (isOmitted(inputs)) return 'omit';
  if (isRoutedThroughCodemode(inputs)) return 'route-through-codemode';
  return 'direct-inject';
}

/**
 * Crash-recovery downgrade: if a caller decided 'route-through-codemode' but
 * subsequently failed to enable CodeMode (subprocess error, settings write
 * race, etc.), they should downgrade to 'direct-inject' rather than leave the
 * spawn without graph tools. 'omit' is preserved — it's a deliberate gate.
 */
export function downgradeOnCodemodeFailure(decision: RoutingDecision): RoutingDecision {
  return decision === 'route-through-codemode' ? 'direct-inject' : decision;
}
