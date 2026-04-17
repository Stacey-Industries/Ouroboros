/**
 * correctionDetector.ts — Regex-based detector for user self-correction messages.
 *
 * Scans a user message for phrases like "that's deprecated in Zod 4" or
 * "useEffect doesn't work that way in React 19" and extracts the library name.
 *
 * Wave 29.5 Phase H (H4).
 *
 * Design constraints:
 * - Pure: no I/O, no side effects.
 * - Safe on large messages: input is sliced to MAX_SCAN_BYTES before matching.
 * - Regexes are all literal (no dynamic construction) to satisfy
 *   security/detect-non-literal-regexp ESLint rule.
 * - No nested quantifiers: patterns are anchored or bounded to prevent
 *   catastrophic backtracking.
 */

import { CURATED_LIBRARIES } from './correctionLibraries';

// ─── Public types ─────────────────────────────────────────────────────────────

export type CorrectionConfidence = 'high' | 'medium' | 'low';

export interface CorrectionHit {
  library: string;
  phrasingMatch: string;
  confidence: CorrectionConfidence;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Slice input to this length before regex matching. Genuine correction phrases
 *  appear near the start of a message; this prevents regex work on huge pastes. */
const MAX_SCAN_BYTES = 50_000;

// ─── Pattern definitions ──────────────────────────────────────────────────────
//
// Each pattern is a literal RegExp (not built from strings) to satisfy
// security/detect-non-literal-regexp. Capture groups are used where the
// library name appears inline; otherwise, library extraction falls back to
// the curated list scan.

/** Pattern 1 — "that is wrong / that's not right / this is incorrect" */
const PAT_THAT_IS_WRONG =
  /\b(?:that|that's|this)\s+(?:is\s+)?(?:wrong|incorrect|not right|not how)\b/i;

/** Pattern 2 — "doesn't work that way / doesn't work like that" */
const PAT_DOESNT_WORK = /\bdoesn't work (?:that way|like that)\b/i;

/**
 * Pattern 3 — "deprecated in LibName v?N / removed in LibName v?N /
 *              breaking change in LibName v?N"
 * Capture group 1 = library name, group 2 = version (optional).
 */
const PAT_DEPRECATED_IN =
  /\b(?:deprecated|removed|breaking change) in ([A-Z][a-zA-Z0-9.-]+)\s*(v?\d+)?/i;

/**
 * Pattern 4 — "wrong API for LibName / old way in LibName / old syntax for LibName"
 * Capture group 1 = library name.
 */
const PAT_WRONG_API =
  /\b(?:wrong|old) (?:API|way|syntax|pattern) (?:for|in) ([A-Z][a-zA-Z0-9.-]+)/i;

/** Pattern 5 — "don't use <word>" — low confidence, ambiguous */
const PAT_DONT_USE = /\bdon't use \w+\b/i;

// ─── Pattern list (ordered: most specific first) ──────────────────────────────

interface PatternEntry {
  re: RegExp;
  /** Index of the capture group that contains the library name (1-based). */
  libGroup: number | null;
  label: string;
}

const PATTERNS: readonly PatternEntry[] = [
  { re: PAT_DEPRECATED_IN, libGroup: 1, label: 'deprecated/removed/breaking-in' },
  { re: PAT_WRONG_API, libGroup: 1, label: 'wrong-api-for' },
  { re: PAT_THAT_IS_WRONG, libGroup: null, label: 'that-is-wrong' },
  { re: PAT_DOESNT_WORK, libGroup: null, label: 'doesnt-work-that-way' },
  { re: PAT_DONT_USE, libGroup: null, label: 'dont-use' },
];

// ─── Curated-list index (built once, case-insensitive) ────────────────────────

/** Map from lowercased library name → canonical form. */
const LIBRARY_INDEX: ReadonlyMap<string, string> = new Map(
  CURATED_LIBRARIES.map((lib) => [lib.toLowerCase(), lib]),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Try to match a captured library name against the curated index.
 *  Returns the canonical name or the raw captured string if not found. */
function resolveFromCapture(raw: string): string {
  return LIBRARY_INDEX.get(raw.toLowerCase()) ?? raw;
}

/** Scan the message for any curated library name. Returns the first match
 *  (canonical form) or null if none found. */
function scanForKnownLibrary(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [key, canonical] of LIBRARY_INDEX) {
    if (lower.includes(key)) return canonical;
  }
  return null;
}

/** Determine the confidence level for a given pattern + library extraction path. */
function computeConfidence(
  patternLabel: string,
  libFoundViaCapture: boolean,
): CorrectionConfidence {
  if (patternLabel === 'dont-use') return 'low';
  if (libFoundViaCapture) return 'high';
  return 'medium';
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Detect whether a user message signals a self-correction about a library API.
 *
 * Returns `null` if no correction pattern matches or no library can be identified.
 * Returns a `CorrectionHit` with the canonical library name, the matched phrase,
 * and a confidence level.
 */
export function detectCorrection(userMessage: string): CorrectionHit | null {
  if (!userMessage) return null;

  // Slice to limit — genuine corrections appear near the start
  const text = userMessage.length > MAX_SCAN_BYTES
    ? userMessage.slice(0, MAX_SCAN_BYTES)
    : userMessage;

  for (const { re, libGroup, label } of PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;

    const phrasingMatch = match[0];

    // Try to get library from capture group first (high confidence path)
    const captured = libGroup !== null ? match[libGroup] : undefined;
    if (captured) {
      const library = resolveFromCapture(captured);
      return {
        library,
        phrasingMatch,
        confidence: computeConfidence(label, true),
      };
    }

    // Fall back to scanning the message for a curated library name
    const library = scanForKnownLibrary(text);
    if (!library) continue; // No library found — skip this pattern match

    return {
      library,
      phrasingMatch,
      confidence: computeConfidence(label, false),
    };
  }

  return null;
}
