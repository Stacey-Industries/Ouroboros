/**
 * contextSelectorHelpers.test.ts — Unit tests for rankCandidates + MutableCandidate.
 *
 * Wave 29.5 Phase D: Verifies that pagerank_score is correctly propagated from
 * MutableCandidate through rankCandidates into the resulting RankedContextFile[].
 */

import { describe, expect, it } from 'vitest';

import type { MutableCandidate } from './contextSelectorHelpers';
import { rankCandidates } from './contextSelectorHelpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCandidate(filePath: string, weight: number, pagerank_score?: number | null): MutableCandidate {
  return {
    filePath,
    reasons: [{ kind: 'git_diff', weight, detail: 'changed' }],
    pagerank_score,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('rankCandidates — pagerank_score propagation (Wave 29.5 Phase D)', () => {
  it('sets pagerank_score to null when the candidate has no pagerank_score', () => {
    const candidates = new Map<string, MutableCandidate>();
    candidates.set('a', makeCandidate('src/a.ts', 56));

    const ranked = rankCandidates(candidates);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].pagerank_score).toBeNull();
  });

  it('sets pagerank_score to null when explicitly set to null on the candidate', () => {
    const candidates = new Map<string, MutableCandidate>();
    candidates.set('a', makeCandidate('src/a.ts', 56, null));

    const ranked = rankCandidates(candidates);

    expect(ranked[0].pagerank_score).toBeNull();
  });

  it('carries through a non-null pagerank_score from the candidate', () => {
    const candidates = new Map<string, MutableCandidate>();
    candidates.set('a', makeCandidate('src/a.ts', 56, 0.42));

    const ranked = rankCandidates(candidates);

    expect(ranked[0].pagerank_score).toBe(0.42);
  });

  it('preserves pagerank_score independently for each ranked file', () => {
    const candidates = new Map<string, MutableCandidate>();
    candidates.set('a', makeCandidate('src/a.ts', 80, 0.9));
    candidates.set('b', makeCandidate('src/b.ts', 40, null));
    candidates.set('c', makeCandidate('src/c.ts', 60, 0.3));

    const ranked = rankCandidates(candidates);

    // Ranked descending by score: a(80) → c(60) → b(40)
    expect(ranked[0].filePath).toBe('src/a.ts');
    expect(ranked[0].pagerank_score).toBe(0.9);

    expect(ranked[1].filePath).toBe('src/c.ts');
    expect(ranked[1].pagerank_score).toBe(0.3);

    expect(ranked[2].filePath).toBe('src/b.ts');
    expect(ranked[2].pagerank_score).toBeNull();
  });

  it('null pagerank_score serialises as null (not undefined) via JSON.stringify', () => {
    const candidates = new Map<string, MutableCandidate>();
    candidates.set('a', makeCandidate('src/a.ts', 56, null));

    const ranked = rankCandidates(candidates);
    const parsed = JSON.parse(JSON.stringify(ranked[0])) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(parsed, 'pagerank_score')).toBe(true);
    expect(parsed['pagerank_score']).toBeNull();
  });
});
