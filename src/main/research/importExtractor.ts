/**
 * importExtractor.ts — Regex-based TS/JS import specifier extractor.
 *
 * Wave 30 Phase D. Best-effort, not a full AST parser.
 * Handles:
 *   import X from 'pkg'
 *   import { X } from 'pkg'
 *   import 'pkg'
 *   import * as X from 'pkg'
 *   export { X } from 'pkg'
 *   const x = require('pkg')
 *   const x = require("pkg")
 *   dynamic import('pkg')
 *
 * Returns raw specifiers (e.g. 'react', '@scope/pkg', 'next/server').
 * Callers should normalise via triggerEvaluator.normalizeImportToLibrary.
 */

// ─── Patterns ─────────────────────────────────────────────────────────────────

// Side-effect import or re-export-bare: import 'pkg' / export 'pkg'
// Anchored to start-of-token; [^'"\n]+ is bounded by the line length.
const IMPORT_BARE_RE = /(?:^|\s)(?:import|export)\s+['"]([^'"]+)['"]/gm;

// Named/default/namespace import: import ... from 'pkg' or export ... from 'pkg'
// Uses a fixed-width scan: from followed by quote — no nested alternation.
const IMPORT_FROM_RE = /\bfrom\s+['"]([^'"]+)['"]/gm;

// require('pkg') or require("pkg")
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// All patterns are static string literals — satisfies security/detect-non-literal-regexp.
// Character classes use [^'"\n] (negated, single-element exclusion) — no catastrophic backtracking.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function collectMatches(re: RegExp, source: string): string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  // Reset lastIndex before use
  re.lastIndex = 0;
  while ((m = re.exec(source)) !== null) {
    const specifier = m[1];
    if (specifier) results.push(specifier);
  }
  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract all import/require specifiers from the given TS/JS source string.
 * Returns an array of raw module specifiers (may include duplicates).
 */
export function extractImports(source: string): string[] {
  const bareMatches = collectMatches(IMPORT_BARE_RE, source);
  const fromMatches = collectMatches(IMPORT_FROM_RE, source);
  const requireMatches = collectMatches(REQUIRE_RE, source);
  return [...bareMatches, ...fromMatches, ...requireMatches];
}
