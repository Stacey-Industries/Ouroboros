/**
 * stalenessMatrix.ts — Pure lookup API for the staleness matrix.
 *
 * No I/O at evaluation time. Curated list wins over heuristics. Denylist
 * short-circuits to { stale: false, reason: 'denylist' }.
 *
 * Network-based heuristic lookup (npm registry latest-release check) is
 * deferred to a later phase — unknown libraries return reason:'no-data'.
 */

import {
  CURATED_STALE_PREFIXES,
  CURATED_STALENESS_ENTRIES,
} from './stalenessMatrixData';
import {
  HEURISTIC_DENYLIST,
  INTERNAL_PACKAGE_PREFIXES,
} from './stalenessMatrixDenylist';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StalenessEntry =
  | { kind: 'curated'; library: string; cutoffVersion: string; cutoffDate: string; confidence: 'high' }
  | { kind: 'heuristic'; library: string; releasedAfter: string; confidence: 'medium' };

export type StalenessReason =
  | 'curated-match'
  | 'heuristic-match'
  | 'denylist'
  | 'no-data';

export interface StalenessLookup {
  library: string;
  stale: boolean;
  entry: StalenessEntry | null;
  reason: StalenessReason;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isInDenylist(library: string): boolean {
  if ((HEURISTIC_DENYLIST as readonly string[]).includes(library)) {
    return true;
  }
  return INTERNAL_PACKAGE_PREFIXES.some((p) => library.startsWith(p));
}

function findCuratedEntry(library: string): StalenessEntry | null {
  const exact = CURATED_STALENESS_ENTRIES.find((e) => e.library === library);
  if (exact !== undefined) {
    return exact;
  }
  const matchedPrefix = CURATED_STALE_PREFIXES.find((p) =>
    library.startsWith(p)
  );
  if (matchedPrefix === undefined) {
    return null;
  }
  return {
    kind: 'curated',
    library,
    cutoffVersion: '*',
    cutoffDate: '2025-06-01',
    confidence: 'high',
  };
}

function buildDenylistResult(library: string): StalenessLookup {
  return { library, stale: false, entry: null, reason: 'denylist' };
}

function buildCuratedResult(
  library: string,
  entry: StalenessEntry
): StalenessLookup {
  return { library, stale: true, entry, reason: 'curated-match' };
}

function buildNoDataResult(library: string): StalenessLookup {
  return { library, stale: false, entry: null, reason: 'no-data' };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up whether a library is considered stale relative to the training
 * cutoff. Pure function — no network, no filesystem access.
 *
 * Resolution order:
 *   1. Denylist (exact name or internal-package prefix) → stale: false
 *   2. Curated list (exact name) → stale: true
 *   3. Curated prefix patterns → stale: true
 *   4. No data → stale: false, reason: 'no-data'
 *
 * @param library        npm package name (e.g. 'next', '@tanstack/react-query')
 * @param importedVersion reserved for future version-range checks (Phase B+)
 */
export function isStale(library: string, importedVersion?: string): StalenessLookup {
  void importedVersion; // reserved — version-range comparison deferred to Phase B
  if (isInDenylist(library)) {
    return buildDenylistResult(library);
  }
  const entry = findCuratedEntry(library);
  if (entry !== null) {
    return buildCuratedResult(library, entry);
  }
  return buildNoDataResult(library);
}

/**
 * Returns the list of all explicitly curated library names.
 * Used by the trigger evaluator to scope conservative-mode checks.
 */
export function getAllCuratedLibraries(): readonly string[] {
  return CURATED_STALENESS_ENTRIES.map((e) => e.library);
}
