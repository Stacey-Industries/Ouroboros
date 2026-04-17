/**
 * factClaimDetector.ts — Pure fact-shaped claim detector.
 *
 * Wave 30 Phase F. No I/O, no stream coupling — safe to call per-chunk.
 * Returns all matches in a text chunk for libraries whose patterns fire,
 * filtered by a minimum confidence level.
 */

import type { FactClaimPattern } from './factClaimPatterns';
import { FACT_CLAIM_PATTERNS } from './factClaimPatterns';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FactClaimMatch {
  library: string;
  pattern: RegExp;
  matchText: string;
  confidence: FactClaimPattern['confidence'];
  /** Byte offset of the match start within the chunk string. */
  offset: number;
}

// ─── Confidence ordering ──────────────────────────────────────────────────────

const CONFIDENCE_RANK: Record<FactClaimPattern['confidence'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function confidenceAtLeast(
  candidate: FactClaimPattern['confidence'],
  floor: FactClaimPattern['confidence'],
): boolean {
  // eslint-disable-next-line security/detect-object-injection -- keys are string literals from the type union
  return CONFIDENCE_RANK[candidate] >= CONFIDENCE_RANK[floor];
}

function makeGlobalRegExp(src: RegExp): RegExp {
  const flags = src.flags.includes('g') ? src.flags : src.flags + 'g';
  // eslint-disable-next-line security/detect-non-literal-regexp -- source comes from FACT_CLAIM_PATTERNS literals, not user input
  return new RegExp(src.source, flags);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan a stream chunk for fact-shaped claims about known libraries.
 *
 * @param chunk         Incoming streamed text fragment.
 * @param minConfidence Minimum confidence level to include in results.
 *                      Defaults to 'medium' — filters out low-confidence
 *                      (ambiguous) patterns unless explicitly requested.
 * @returns             All matches found, in encounter order.
 *                      Multiple patterns may match the same chunk.
 *                      Empty array when no patterns match or chunk is empty.
 */
export function detectFactClaims(
  chunk: string,
  minConfidence: FactClaimPattern['confidence'] = 'medium',
): FactClaimMatch[] {
  if (chunk.length === 0) return [];

  const results: FactClaimMatch[] = [];

  for (const entry of FACT_CLAIM_PATTERNS) {
    if (!confidenceAtLeast(entry.confidence, minConfidence)) continue;

    const re = makeGlobalRegExp(entry.pattern);
    let match: RegExpExecArray | null;
    while ((match = re.exec(chunk)) !== null) {
      results.push({
        library: entry.library,
        pattern: entry.pattern,
        matchText: match[0],
        confidence: entry.confidence,
        offset: match.index,
      });
    }
  }

  return results;
}
