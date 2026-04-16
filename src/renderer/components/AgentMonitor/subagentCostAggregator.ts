/**
 * subagentCostAggregator.ts — Pure aggregation helpers for parent + subagent cost rollup.
 *
 * Used by CostDashboard / SessionTableRow to combine parent session cost with
 * subagent cost rollups fetched from the subagent tracker.
 *
 * All functions are pure — no IPC calls or side effects.
 */

import type { SubagentCostRollup } from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Combined cost totals for a parent session including all its subagents. */
export interface CombinedCost {
  /** Parent-only cost in USD. */
  parentUsd: number;
  /** Subagent-only cost in USD (sum across all subagents). */
  subagentUsd: number;
  /** Combined total in USD. */
  totalUsd: number;
  /** Number of subagent sessions. */
  childCount: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Combines a parent session cost with an optional subagent rollup into a
 * single `CombinedCost` struct.
 *
 * When rollup is null/undefined (no children or feature flag off), the result
 * equals parent-only totals exactly — satisfying the "zero subagents" invariant.
 */
export function combineCosts(
  parentUsd: number,
  rollup: SubagentCostRollup | null | undefined,
): CombinedCost {
  if (!rollup || rollup.childCount === 0) {
    return { parentUsd, subagentUsd: 0, totalUsd: parentUsd, childCount: 0 };
  }
  const subagentUsd = rollup.usdCost;
  return {
    parentUsd,
    subagentUsd,
    totalUsd: parentUsd + subagentUsd,
    childCount: rollup.childCount,
  };
}

/**
 * Formats a rollup disclosure label for display in the cost table.
 * Returns null when there are no subagent children (nothing to disclose).
 *
 * Example: "total $0.0500 (parent $0.0300, 2 subagents $0.0200)"
 */
export function formatRollupDisclosure(combined: CombinedCost): string | null {
  if (combined.childCount === 0) return null;
  const total = combined.totalUsd.toFixed(4);
  const parent = combined.parentUsd.toFixed(4);
  const sub = combined.subagentUsd.toFixed(4);
  const noun = combined.childCount === 1 ? 'subagent' : 'subagents';
  return `total $${total} (parent $${parent}, ${combined.childCount} ${noun} $${sub})`;
}
