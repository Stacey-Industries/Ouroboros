/**
 * contextSelectorFeatures.test.ts — Unit tests for computeFeatures + buildFeatureCtx.
 *
 * Verifies:
 * - Feature order matches BUNDLED_CONTEXT_WEIGHTS.featureOrder exactly.
 * - All features are in [0, 1].
 * - Each feature channel responds to the correct candidate signal.
 * - toolKindHint one-hot is exclusive and maps mode correctly.
 * - buildFeatureCtx computes correct per-cycle maxima.
 */

import { describe, expect, it } from 'vitest';

import { BUNDLED_CONTEXT_WEIGHTS } from './contextClassifierDefaults';
import type { FeatureCtx } from './contextSelectorFeatures';
import { buildFeatureCtx, computeFeatures } from './contextSelectorFeatures';
import type { MutableCandidate } from './contextSelectorHelpers';
import type { TaskRequest } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(mode: TaskRequest['mode'] = 'edit'): TaskRequest {
  return {
    workspaceRoots: ['/project'],
    goal: 'fix the bug',
    mode,
    provider: 'codex',
    verificationProfile: 'fast',
  };
}

function makeCandidate(filePath = '/project/src/foo.ts'): MutableCandidate {
  return { filePath, reasons: [], pagerank_score: null };
}

function makeCtx(overrides: Partial<FeatureCtx> = {}): FeatureCtx {
  return {
    request: makeRequest(),
    maxAdditiveScore: 100,
    maxPagerankScore: 1,
    maxKeywordHits: 5,
    ...overrides,
  };
}

// ─── Feature order ────────────────────────────────────────────────────────────

describe('computeFeatures — feature order matches defaults', () => {
  it('produces exactly the features in BUNDLED_CONTEXT_WEIGHTS.featureOrder', () => {
    const candidate = makeCandidate();
    const ctx = makeCtx();
    const features = computeFeatures(candidate, ctx);
    const keys = Object.keys(features);

    expect(keys).toEqual([...BUNDLED_CONTEXT_WEIGHTS.featureOrder]);
  });
});

// ─── All values in [0, 1] ────────────────────────────────────────────────────

describe('computeFeatures — normalization', () => {
  it('all features are in [0, 1] for a blank candidate', () => {
    const candidate = makeCandidate();
    const ctx = makeCtx();
    const features = computeFeatures(candidate, ctx);

    for (const [key, val] of Object.entries(features)) {
      expect(val, `${key} out of range`).toBeGreaterThanOrEqual(0);
      expect(val, `${key} out of range`).toBeLessThanOrEqual(1);
    }
  });

  it('all features are in [0, 1] for a fully loaded candidate', () => {
    const candidate = makeCandidate();
    candidate.pagerank_score = 0.9;
    candidate.reasons = [
      { kind: 'recent_user_edit', weight: 32, detail: '' },
      { kind: 'keyword_match', weight: 29, detail: '' },
      { kind: 'import_adjacency', weight: 23, detail: '' },
      { kind: 'dependency', weight: 12, detail: '' },
    ];
    const ctx = makeCtx({ maxPagerankScore: 0.9, maxKeywordHits: 4, maxAdditiveScore: 96 });
    const features = computeFeatures(candidate, ctx);

    for (const [key, val] of Object.entries(features)) {
      expect(val, `${key} out of range`).toBeGreaterThanOrEqual(0);
      expect(val, `${key} out of range`).toBeLessThanOrEqual(1);
    }
  });
});

// ─── recencyScore ────────────────────────────────────────────────────────────

describe('computeFeatures — recencyScore', () => {
  it('is 0 for candidate with no recency reason', () => {
    const candidate = makeCandidate();
    expect(computeFeatures(candidate, makeCtx()).recencyScore).toBe(0);
  });

  it('is 1 for recent_user_edit at weight 32', () => {
    const candidate = makeCandidate();
    candidate.reasons = [{ kind: 'recent_user_edit', weight: 32, detail: '' }];
    expect(computeFeatures(candidate, makeCtx()).recencyScore).toBeCloseTo(1);
  });

  it('is lower for recent_agent_edit (weight 4) vs recent_user_edit (weight 32)', () => {
    const agentC = makeCandidate('/a.ts');
    agentC.reasons = [{ kind: 'recent_agent_edit', weight: 4, detail: '' }];
    const userC = makeCandidate('/b.ts');
    userC.reasons = [{ kind: 'recent_user_edit', weight: 32, detail: '' }];
    const ctx = makeCtx();

    expect(computeFeatures(agentC, ctx).recencyScore).toBeLessThan(
      computeFeatures(userC, ctx).recencyScore,
    );
  });
});

// ─── pagerankScore ───────────────────────────────────────────────────────────

describe('computeFeatures — pagerankScore', () => {
  it('is 0 when pagerank_score is null', () => {
    const candidate = makeCandidate();
    expect(computeFeatures(candidate, makeCtx()).pagerankScore).toBe(0);
  });

  it('is 1 when pagerank equals maxPagerankScore', () => {
    const candidate = makeCandidate();
    candidate.pagerank_score = 0.8;
    const ctx = makeCtx({ maxPagerankScore: 0.8 });
    expect(computeFeatures(candidate, ctx).pagerankScore).toBeCloseTo(1);
  });

  it('is proportional between 0 and max', () => {
    const candidate = makeCandidate();
    candidate.pagerank_score = 0.4;
    const ctx = makeCtx({ maxPagerankScore: 0.8 });
    expect(computeFeatures(candidate, ctx).pagerankScore).toBeCloseTo(0.5);
  });
});

// ─── importDistance ──────────────────────────────────────────────────────────

describe('computeFeatures — importDistance', () => {
  it('is 0 for candidate with no import reason', () => {
    const candidate = makeCandidate();
    expect(computeFeatures(candidate, makeCtx()).importDistance).toBe(0);
  });

  it('is 1 for import_adjacency (distance 1)', () => {
    const candidate = makeCandidate();
    candidate.reasons = [{ kind: 'import_adjacency', weight: 23, detail: '' }];
    expect(computeFeatures(candidate, makeCtx()).importDistance).toBe(1);
  });

  it('is 0.5 for dependency (distance 2)', () => {
    const candidate = makeCandidate();
    candidate.reasons = [{ kind: 'dependency', weight: 12, detail: '' }];
    expect(computeFeatures(candidate, makeCtx()).importDistance).toBe(0.5);
  });

  it('import_adjacency scores higher than dependency', () => {
    const adjC = makeCandidate('/a.ts');
    adjC.reasons = [{ kind: 'import_adjacency', weight: 23, detail: '' }];
    const depC = makeCandidate('/b.ts');
    depC.reasons = [{ kind: 'dependency', weight: 12, detail: '' }];

    expect(computeFeatures(adjC, makeCtx()).importDistance).toBeGreaterThan(
      computeFeatures(depC, makeCtx()).importDistance,
    );
  });
});

// ─── keywordOverlap ──────────────────────────────────────────────────────────

describe('computeFeatures — keywordOverlap', () => {
  it('is 0 for no keyword_match reason', () => {
    const candidate = makeCandidate();
    expect(computeFeatures(candidate, makeCtx()).keywordOverlap).toBe(0);
  });

  it('is 1 when keyword hits equal maxKeywordHits', () => {
    const candidate = makeCandidate();
    // weight = 26 + hitCount - 1; hitCount=4 → weight=29; maxKeywordHits=4
    candidate.reasons = [{ kind: 'keyword_match', weight: 29, detail: '' }];
    const ctx = makeCtx({ maxKeywordHits: 4 });
    expect(computeFeatures(candidate, ctx).keywordOverlap).toBeCloseTo(1);
  });

  it('is proportional to hit count', () => {
    const c2 = makeCandidate('/a.ts');
    c2.reasons = [{ kind: 'keyword_match', weight: 27, detail: '' }]; // hits=2
    const c4 = makeCandidate('/b.ts');
    c4.reasons = [{ kind: 'keyword_match', weight: 29, detail: '' }]; // hits=4
    const ctx = makeCtx({ maxKeywordHits: 4 });

    expect(computeFeatures(c4, ctx).keywordOverlap).toBeGreaterThan(
      computeFeatures(c2, ctx).keywordOverlap,
    );
  });
});

// ─── toolKindHint one-hot ────────────────────────────────────────────────────

describe('computeFeatures — toolKindHint one-hot', () => {
  it('edit mode → toolKindHint_edit=1, others=0', () => {
    const f = computeFeatures(makeCandidate(), makeCtx({ request: makeRequest('edit') }));
    expect(f.toolKindHint_edit).toBe(1);
    expect(f.toolKindHint_read).toBe(0);
    expect(f.toolKindHint_write).toBe(0);
    expect(f.toolKindHint_other).toBe(0);
  });

  it('review mode → toolKindHint_read=1, others=0', () => {
    const f = computeFeatures(makeCandidate(), makeCtx({ request: makeRequest('review') }));
    expect(f.toolKindHint_read).toBe(1);
    expect(f.toolKindHint_edit).toBe(0);
    expect(f.toolKindHint_write).toBe(0);
    expect(f.toolKindHint_other).toBe(0);
  });

  it('plan mode → toolKindHint_other=1, others=0', () => {
    const f = computeFeatures(makeCandidate(), makeCtx({ request: makeRequest('plan') }));
    expect(f.toolKindHint_other).toBe(1);
    expect(f.toolKindHint_read).toBe(0);
    expect(f.toolKindHint_edit).toBe(0);
    expect(f.toolKindHint_write).toBe(0);
  });

  it('exactly one toolKindHint bit is set', () => {
    for (const mode of ['edit', 'review', 'plan'] as const) {
      const f = computeFeatures(makeCandidate(), makeCtx({ request: makeRequest(mode) }));
      const sum = f.toolKindHint_read + f.toolKindHint_edit + f.toolKindHint_write + f.toolKindHint_other;
      expect(sum, `mode=${mode}`).toBe(1);
    }
  });
});

// ─── buildFeatureCtx ─────────────────────────────────────────────────────────

describe('buildFeatureCtx', () => {
  it('computes maxPagerankScore from candidates', () => {
    const candidates = new Map<string, MutableCandidate>();
    const c1 = makeCandidate('/a.ts');
    c1.pagerank_score = 0.3;
    const c2 = makeCandidate('/b.ts');
    c2.pagerank_score = 0.9;
    candidates.set('/a.ts', c1);
    candidates.set('/b.ts', c2);

    const ctx = buildFeatureCtx(makeRequest(), candidates);
    expect(ctx.maxPagerankScore).toBeCloseTo(0.9);
  });

  it('computes maxKeywordHits from keyword_match reasons', () => {
    const candidates = new Map<string, MutableCandidate>();
    const c1 = makeCandidate('/a.ts');
    c1.reasons = [{ kind: 'keyword_match', weight: 27, detail: '' }]; // hits=2
    const c2 = makeCandidate('/b.ts');
    c2.reasons = [{ kind: 'keyword_match', weight: 30, detail: '' }]; // hits=5
    candidates.set('/a.ts', c1);
    candidates.set('/b.ts', c2);

    const ctx = buildFeatureCtx(makeRequest(), candidates);
    expect(ctx.maxKeywordHits).toBe(5);
  });

  it('returns 0 for maxima when candidates map is empty', () => {
    const ctx = buildFeatureCtx(makeRequest(), new Map());
    expect(ctx.maxPagerankScore).toBe(0);
    expect(ctx.maxKeywordHits).toBe(0);
    expect(ctx.maxAdditiveScore).toBe(0);
  });
});
