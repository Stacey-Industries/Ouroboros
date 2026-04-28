/**
 * graphUsageClassifier.ts — Wave 50 Phase D
 *
 * Shared classifier for Grep/Read tool-use shape detection.
 * Determines whether a tool call is "symbol-shaped" (likely a candidate
 * for a graph tool like search_graph/trace_call_path) vs "literal-shaped"
 * (a concrete string search or file path — correct choice for Grep/Read).
 *
 * Imported by both:
 *   - src/main/hooksGraphUsageTap.ts (live telemetry)
 *   - scripts/analyze-graph-adherence.ts (corpus analysis)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolShape = 'symbol' | 'literal' | 'unknown';

// ─── Regex helpers ────────────────────────────────────────────────────────────

/**
 * Presence of regex metacharacters means the pattern is a regex expression,
 * which is always a "literal" usage (correct tool choice — Grep handles regex).
 */
export const REGEX_META = /[{}[\]^$|()*+?]/;

/**
 * A pattern wrapped in quotes is a string literal search — correct for Grep.
 */
export const QUOTED_LITERAL = /^["'`].*["'`]$/;

/**
 * An unquoted bare identifier (no regex operators) looks like a symbol name.
 * Must be ≥3 chars to avoid short patterns like "id" or "fn" which are
 * ambiguous. Short patterns are classified literal by the caller allowlist.
 */
export const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]{2,}$/;

// ─── Core classifiers ─────────────────────────────────────────────────────────

/**
 * Classifies a Grep pattern as symbol, literal, or unknown.
 *
 * symbol   — bare unquoted identifier (≥3 chars, no metacharacters)
 * literal  — quoted string, regex, or multi-word phrase
 * unknown  — empty / missing pattern
 */
export function classifyGrepPattern(pattern: string): ToolShape {
  if (!pattern) return 'unknown';
  if (QUOTED_LITERAL.test(pattern)) return 'literal';
  if (REGEX_META.test(pattern)) return 'literal';
  if (BARE_IDENTIFIER.test(pattern)) return 'symbol';
  return 'literal';
}

/**
 * Classifies a tool call by name + input.
 *
 * For Grep: delegates to classifyGrepPattern.
 * For Read: any non-empty file_path is "literal" (correct tool choice).
 *           Missing file_path is "unknown" (malformed call).
 * Other tools: always "unknown" (not in scope).
 */
export function classifyShape(
  toolName: string,
  input: Record<string, unknown> | undefined,
): ToolShape {
  if (!input) return 'unknown';
  if (toolName === 'Grep') {
    const pattern = typeof input.pattern === 'string' ? input.pattern : '';
    return classifyGrepPattern(pattern);
  }
  if (toolName === 'Read') {
    return typeof input.file_path === 'string' && input.file_path ? 'literal' : 'unknown';
  }
  return 'unknown';
}
