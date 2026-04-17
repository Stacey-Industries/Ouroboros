/**
 * stalenessMatrixDenylist.ts — Well-known stable libraries that should never
 * be flagged as stale, plus internal-package detection patterns.
 *
 * Quarterly review: add entries here to suppress false-positive stale signals
 * for utility libraries whose public API is highly stable across versions.
 */

// ─── Denylist ─────────────────────────────────────────────────────────────────

/**
 * Exact package names that are considered perpetually stable.
 * `isStale()` short-circuits to `{ stale: false, reason: 'denylist' }` for
 * any library whose name exactly matches an entry here.
 */
export const HEURISTIC_DENYLIST: readonly string[] = [
  // Utility libraries — APIs barely change across major versions
  'lodash',
  'lodash-es',
  'ramda',
  'date-fns',
  'uuid',
  'nanoid',
  'classnames',
  'clsx',
  'tslib',

  // Version-coupled to another curated entry — no independent staleness signal
  'react-dom',

  // Language / compiler — not a library API surface
  'typescript',

  // Common Node.js utilities that change slowly
  'chalk',
  'commander',
  'yargs',
  'minimist',
  'glob',
  'fast-glob',
  'micromatch',
  'cross-env',
  'dotenv',
  'ms',
  'debug',
  'semver',
];

/**
 * Prefix patterns for internal / scoped packages that should never be
 * flagged stale (e.g. `@mycompany/`, `@internal/`).
 * Matched via `String.prototype.startsWith`.
 */
export const INTERNAL_PACKAGE_PREFIXES: readonly string[] = [
  '@internal/',
  '@local/',
  '@private/',
];
