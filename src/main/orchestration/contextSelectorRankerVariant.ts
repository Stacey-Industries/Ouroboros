/**
 * contextSelectorRankerVariant.ts — Wave 53b Phase C
 *
 * Variant weight schemes for the context ranker. Selected by the
 * `contextRanker.mode` config flag ('current' | 'tuned' | 'experimental').
 * Default is 'current', which preserves pre-53b additive ranking.
 *
 * ─── Rationale ───────────────────────────────────────────────────────────────
 * Phase A's offline analysis (roadmap/wave-53b-analysis.md) returned a mean
 * hit rate of 6.3% across n=24 analyzed sessions (decision: REDESIGN). The
 * recall curve barely rose with k, indicating the structural problem is that
 * the ranker selects the *wrong* files entirely, not that they're misordered.
 *
 * Two caveats from Phase A:
 *   1. `<relevant_code>` includes snippet *content*, so a low re-fetch rate may
 *      indicate that snippets satisfied the need rather than that the ranker was
 *      wrong. The 45.8% any-hit rate is the more reliable signal.
 *   2. The corpus is biased (~40% IDE-orchestrated) and n=24 is small.
 *
 * Given that single-weight tweaks cannot fix a structural deficit, the variants
 * below are **exploratory rearrangements**, not validated improvements. Their
 * purpose is to give the `contextRanker.mode` flag something concrete to test
 * while the online telemetry from Phase B accumulates enough data to inform a
 * proper redesign wave.
 *
 * ─── Variant weight rationale ─────────────────────────────────────────────────
 * Phase A found that sessions which did Read pre-loaded files tended to involve
 * files with concrete file-state signals (git_diff, dirty_buffer, recent_edit),
 * while `keyword_match` was the dominant driver of zero-hit sessions. The tuned
 * variant shifts weight away from text-match heuristics toward file-state signals.
 *
 * tuned mode:
 *   - keyword_match: 26 → 16  (−10): keyword matches dominate the long tail and
 *     produce the most zero-hit sessions. De-emphasise the noisiest signal.
 *   - git_diff:      56 → 70  (+14): sessions that Read pre-loaded files often
 *     included git-diff-touched files. Cheap, defensible boost.
 *   - dirty_buffer:  68 → 78  (+10): open dirty buffers correlate weakly but
 *     non-zero with subsequent Reads; raise to reinforce.
 *   - recent_edit:   32 → 42  (+10): mirror dirty_buffer logic at lower magnitude.
 *
 * experimental mode (more aggressive):
 *   - keyword_match: 26 → 12  (−14): lean harder away from text-match.
 *   - git_diff:      56 → 75  (+19): lean harder into file-state signals.
 *   - diagnostic:    52 → 70  (+18): diagnostic presence is a strong editorial
 *     signal that the agent will need to inspect that file.
 *   - dirty_buffer / recent_edit: same as tuned.
 *
 * Per-bucket regression risk: the code bucket's any-hit rate (55.6%) is the
 * relevant baseline. If the next quarterly re-run of Phase A's analysis shows
 * the variant pushes that below 50%, that is the regression flag.
 * Casual sessions (any-hit 20%) are not expected to regress further since they
 * barely generate Read calls regardless of what the ranker returns.
 *
 * ─── IMPORTANT: this variant is explicitly NOT a validated improvement ─────────
 * Phase C ships regardless (per user standing direction). The default mode is
 * 'current'. Users opt in to 'tuned' or 'experimental' for testing. Future
 * analysis using Phase B's online telemetry will determine whether either variant
 * outperforms 'current'. Phase D will document findings in roadmap/docs/context-ranker.md.
 */

import type { MutableCandidate } from './contextSelectorHelpers';
import type { ContextReasonKind, RankedContextFile } from './types';

// ─── Weight table type ────────────────────────────────────────────────────────

/**
 * Sparse weight override table. Map.get() avoids security/detect-object-injection.
 * Kinds absent from the map fall back to the reason's stored weight.
 */
export type VariantWeights = ReadonlyMap<ContextReasonKind, number>;

// ─── Tuned variant ────────────────────────────────────────────────────────────

/**
 * Tuned weight overrides (Wave 53b Phase A guidance).
 * Shifts emphasis from text-match heuristics to file-state signals.
 */
export const TUNED_WEIGHTS: VariantWeights = new Map<ContextReasonKind, number>([
  ['git_diff', 70], // +14 vs current (56)
  ['dirty_buffer', 78], // +10 vs current (68)
  ['recent_edit', 42], // +10 vs current (32)
  ['recent_user_edit', 42], // match recent_edit adjustment
  ['keyword_match', 16], // −10 vs current (26)
]);

// ─── Experimental variant ─────────────────────────────────────────────────────

/**
 * Experimental weight overrides — more aggressive than tuned.
 * Leans harder on file-state signals, away from text-match signals.
 */
export const EXPERIMENTAL_WEIGHTS: VariantWeights = new Map<ContextReasonKind, number>([
  ['git_diff', 75], // +19 vs current (56)
  ['dirty_buffer', 78], // +10 vs current (68) — same as tuned
  ['recent_edit', 42], // +10 vs current (32) — same as tuned
  ['recent_user_edit', 42], // match recent_edit adjustment
  ['diagnostic', 70], // +18 vs current (52)
  ['keyword_match', 12], // −14 vs current (26)
]);

// ─── Scoring helpers ──────────────────────────────────────────────────────────

/** Confidence tier derivation (mirrors contextSelectorHelpers.confidenceFor). */
function variantConfidence(
  reasons: Array<{ kind: string; weight: number }>,
  score: number,
): 'high' | 'medium' | 'low' {
  const highKinds = new Set(['user_selected', 'pinned', 'included', 'dirty_buffer']);
  const boostKinds = new Set(['git_diff', 'diagnostic']);
  if (reasons.some((r) => highKinds.has(r.kind))) return 'high';
  if (score >= 80 || reasons.some((r) => boostKinds.has(r.kind))) return 'high';
  return score >= 35 || reasons.length >= 2 ? 'medium' : 'low';
}

function effectiveWeight(
  kind: ContextReasonKind,
  storedWeight: number,
  overrides: VariantWeights,
): number {
  // Map.get() avoids security/detect-object-injection (no bracket access on user-controlled key).
  const override = overrides.get(kind);
  return override !== undefined ? override : storedWeight;
}

function scoreWithOverrides(
  reasons: MutableCandidate['reasons'],
  overrides: VariantWeights,
): number {
  return reasons.reduce((sum, r) => sum + effectiveWeight(r.kind, r.weight, overrides), 0);
}

// ─── Public ranking function ──────────────────────────────────────────────────

/**
 * Rank candidates using variant weight overrides.
 *
 * The original candidate objects are not mutated. Stored reason weights are
 * used as-is except where overrides specify a different value for that kind.
 * Sort order: variant score desc → filePath asc (no tie-break on confidence
 * to keep the logic simple — confidence is recomputed from variant score).
 */
export function rankCandidatesVariant(
  candidates: Map<string, MutableCandidate>,
  overrides: VariantWeights,
): RankedContextFile[] {
  const results: RankedContextFile[] = Array.from(candidates.values()).map((candidate) => {
    const score = scoreWithOverrides(candidate.reasons, overrides);
    const confidence = variantConfidence(candidate.reasons, score);
    return {
      filePath: candidate.filePath,
      score,
      confidence,
      reasons: [...candidate.reasons].sort((a, b) => b.weight - a.weight),
      snippets: [],
      truncationNotes: [],
      pagerank_score: candidate.pagerank_score ?? null,
    } satisfies RankedContextFile;
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.filePath.localeCompare(b.filePath);
  });

  return results;
}
