/**
 * contextSelectorRankerVariant.test.ts — Wave 53b Phase C
 *
 * Verifies that:
 *   (a) tuned + experimental modes produce different rankings/scores than current
 *       for representative inputs (file with keyword_match vs file with git_diff).
 *   (b) current mode (rankCandidates from contextSelectorHelpers) is unchanged.
 *   (c) The variant weight overrides actually flow through scoring.
 *   (d) Empty candidate map is handled.
 *   (e) Confidence tier derivation works.
 */

import { describe, expect, it } from 'vitest';

import type { MutableCandidate } from './contextSelectorHelpers';
import { rankCandidates } from './contextSelectorHelpers';
import {
  EXPERIMENTAL_WEIGHTS,
  rankCandidatesVariant,
  TUNED_WEIGHTS,
  type VariantWeights,
} from './contextSelectorRankerVariant';
import type { ContextReasonKind } from './types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCandidate(
  filePath: string,
  reasons: Array<{ kind: ContextReasonKind; weight: number }>,
): MutableCandidate {
  return {
    filePath,
    reasons: reasons.map((r) => ({ ...r, detail: `${r.kind} on ${filePath}` })),
  };
}

function makeMap(candidates: MutableCandidate[]): Map<string, MutableCandidate> {
  const m = new Map<string, MutableCandidate>();
  for (const c of candidates) m.set(c.filePath.toLowerCase(), c);
  return m;
}

// Two representative candidates. Under CURRENT weights, keyword_match (26) +
// import_adjacency (22) = 48 beats git_diff (56) only if git_diff loses; in
// fact 56 > 48 so git_diff wins under current. But TUNED bumps git_diff to 70
// and lowers keyword_match to 16, widening the gap further (and same direction).
//
// To make the variants observably reorder, we use:
//   /text-file.ts: keyword_match=26 + keyword_match=27 (multi-hit) + import_adjacency=22 = 75
//     Current additive: 75
//     Tuned: keyword_match becomes 16 + 17 = 33; +22 import = 55 (drops by 20)
//   /diff-file.ts: git_diff=56 + recent_edit=32 = 88
//     Current additive: 88
//     Tuned: git_diff=70, recent_edit=42 = 112
//
// So under current both stay diff-file > text-file (88 > 75). Tuned amplifies
// that gap (112 > 55). Critically, the *scores themselves* differ between
// modes — that's the assertion we make.

function buildRepresentativeCandidates(): Map<string, MutableCandidate> {
  return makeMap([
    makeCandidate('/text-file.ts', [
      { kind: 'keyword_match', weight: 26 },
      { kind: 'import_adjacency', weight: 22 },
    ]),
    makeCandidate('/diff-file.ts', [
      { kind: 'git_diff', weight: 56 },
      { kind: 'recent_edit', weight: 32 },
    ]),
    makeCandidate('/diag-file.ts', [
      { kind: 'diagnostic', weight: 52 },
      { kind: 'keyword_match', weight: 26 },
    ]),
  ]);
}

// ─── Variant produces different scores than current ──────────────────────────

describe('rankCandidatesVariant — tuned mode', () => {
  it('produces different scores than current ranker for kinds covered by overrides', () => {
    const candidates = buildRepresentativeCandidates();
    const currentRanked = rankCandidates(candidates);
    const tunedRanked = rankCandidatesVariant(candidates, TUNED_WEIGHTS);

    const currentByPath = new Map(currentRanked.map((r) => [r.filePath, r.score]));
    const tunedByPath = new Map(tunedRanked.map((r) => [r.filePath, r.score]));

    // git_diff goes 56 → 70 AND recent_edit 32 → 42, so /diff-file.ts must score higher
    const diffCurrent = currentByPath.get('/diff-file.ts')!;
    const diffTuned = tunedByPath.get('/diff-file.ts')!;
    expect(diffTuned).toBeGreaterThan(diffCurrent);
    expect(diffTuned).toBe(70 + 42); // explicit math

    // keyword_match goes 26 → 16, so /text-file.ts must score lower
    const textCurrent = currentByPath.get('/text-file.ts')!;
    const textTuned = tunedByPath.get('/text-file.ts')!;
    expect(textTuned).toBeLessThan(textCurrent);
    expect(textTuned).toBe(16 + 22); // import_adjacency unchanged
  });

  it('returns all candidates and sorts by variant score desc', () => {
    const candidates = buildRepresentativeCandidates();
    const ranked = rankCandidatesVariant(candidates, TUNED_WEIGHTS);
    expect(ranked).toHaveLength(3);
    const scores = ranked.map((r) => r.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });
});

describe('rankCandidatesVariant — experimental mode', () => {
  it('produces different scores than tuned for diagnostic + keyword_match kinds', () => {
    const candidates = buildRepresentativeCandidates();
    const tunedRanked = rankCandidatesVariant(candidates, TUNED_WEIGHTS);
    const expRanked = rankCandidatesVariant(candidates, EXPERIMENTAL_WEIGHTS);

    const tunedByPath = new Map(tunedRanked.map((r) => [r.filePath, r.score]));
    const expByPath = new Map(expRanked.map((r) => [r.filePath, r.score]));

    // diagnostic gets a bigger bump in experimental (70) than tuned (no override → 52)
    const diagTuned = tunedByPath.get('/diag-file.ts')!;
    const diagExp = expByPath.get('/diag-file.ts')!;
    expect(diagExp).toBeGreaterThan(diagTuned);
    expect(diagExp).toBe(70 + 12); // diagnostic 70 + keyword_match 12

    // git_diff is bumped harder in experimental (75) vs tuned (70)
    const diffTuned = tunedByPath.get('/diff-file.ts')!;
    const diffExp = expByPath.get('/diff-file.ts')!;
    expect(diffExp).toBeGreaterThan(diffTuned);
    expect(diffExp).toBe(75 + 42);
  });

  it('produces different scores than current', () => {
    const candidates = buildRepresentativeCandidates();
    const currentRanked = rankCandidates(candidates);
    const expRanked = rankCandidatesVariant(candidates, EXPERIMENTAL_WEIGHTS);
    // Sanity: the score arrays must not be identical
    const currentScores = currentRanked.map((r) => r.score).sort();
    const expScores = expRanked.map((r) => r.score).sort();
    expect(expScores).not.toEqual(currentScores);
  });
});

// ─── Current mode unchanged ──────────────────────────────────────────────────

describe('current mode (rankCandidates) — unchanged behavior', () => {
  it('uses stored reason weights as-is (no overrides applied)', () => {
    const candidates = buildRepresentativeCandidates();
    const ranked = rankCandidates(candidates);
    const byPath = new Map(ranked.map((r) => [r.filePath, r.score]));

    // /diff-file.ts = git_diff(56) + recent_edit(32) = 88
    expect(byPath.get('/diff-file.ts')).toBe(88);
    // /text-file.ts = keyword_match(26) + import_adjacency(22) = 48
    expect(byPath.get('/text-file.ts')).toBe(48);
    // /diag-file.ts = diagnostic(52) + keyword_match(26) = 78
    expect(byPath.get('/diag-file.ts')).toBe(78);
  });
});

// ─── Variant lookup mechanics ────────────────────────────────────────────────

describe('rankCandidatesVariant — override mechanics', () => {
  it('falls back to stored reason weight when override map has no entry for that kind', () => {
    const candidates = makeMap([
      makeCandidate('/only-pagerank.ts', [{ kind: 'pagerank', weight: 40 }]),
    ]);
    // Neither tuned nor experimental override pagerank — stored 40 must be used.
    const ranked = rankCandidatesVariant(candidates, TUNED_WEIGHTS);
    expect(ranked[0].score).toBe(40);
  });

  it('respects an override that increases the weight', () => {
    const overrides: VariantWeights = new Map<ContextReasonKind, number>([['git_diff', 999]]);
    const candidates = makeMap([
      makeCandidate('/x.ts', [{ kind: 'git_diff', weight: 56 }]),
    ]);
    const ranked = rankCandidatesVariant(candidates, overrides);
    expect(ranked[0].score).toBe(999);
  });

  it('returns empty array for empty candidate map', () => {
    const ranked = rankCandidatesVariant(new Map(), TUNED_WEIGHTS);
    expect(ranked).toHaveLength(0);
  });
});

// ─── Confidence tier ─────────────────────────────────────────────────────────

describe('rankCandidatesVariant — confidence tier', () => {
  it('flags user_selected as high regardless of score', () => {
    const candidates = makeMap([
      makeCandidate('/u.ts', [{ kind: 'user_selected', weight: 100 }]),
    ]);
    const ranked = rankCandidatesVariant(candidates, TUNED_WEIGHTS);
    expect(ranked[0].confidence).toBe('high');
  });

  it('flags git_diff candidate as high (boost kind)', () => {
    const candidates = makeMap([
      makeCandidate('/g.ts', [{ kind: 'git_diff', weight: 70 }]),
    ]);
    const ranked = rankCandidatesVariant(candidates, TUNED_WEIGHTS);
    expect(ranked[0].confidence).toBe('high');
  });

  it('flags low-score single-reason candidate as low', () => {
    const candidates = makeMap([
      makeCandidate('/k.ts', [{ kind: 'keyword_match', weight: 16 }]),
    ]);
    const ranked = rankCandidatesVariant(candidates, TUNED_WEIGHTS);
    expect(ranked[0].confidence).toBe('low');
  });
});

// ─── Weight constants snapshot ───────────────────────────────────────────────

describe('exported weight constants', () => {
  it('TUNED_WEIGHTS matches Phase A guidance', () => {
    expect(TUNED_WEIGHTS.get('git_diff')).toBe(70);
    expect(TUNED_WEIGHTS.get('dirty_buffer')).toBe(78);
    expect(TUNED_WEIGHTS.get('recent_edit')).toBe(42);
    expect(TUNED_WEIGHTS.get('keyword_match')).toBe(16);
  });

  it('EXPERIMENTAL_WEIGHTS is more aggressive than TUNED', () => {
    expect(EXPERIMENTAL_WEIGHTS.get('git_diff')).toBe(75);
    expect(EXPERIMENTAL_WEIGHTS.get('diagnostic')).toBe(70);
    expect(EXPERIMENTAL_WEIGHTS.get('keyword_match')).toBe(12);
  });
});
