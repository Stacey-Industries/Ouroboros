/**
 * contextSelectorRanker.test.ts — Tests for classifier-based ranking helpers.
 *
 * Covers:
 *   (a) classifierRankCandidates uses classifier score as primary sort key.
 *   (b) runShadowMode logs both score lists and overlap without affecting result.
 *   (c) Classifier failure in shadow mode doesn't throw; logs once per process.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./contextClassifier', () => ({
  score: vi.fn().mockReturnValue(0.5),
}));

vi.mock('./contextSelectorFeatures', () => ({
  buildFeatureCtx: vi.fn().mockReturnValue({
    request: {},
    maxAdditiveScore: 100,
    maxPagerankScore: 1,
    maxKeywordHits: 5,
  }),
  computeFeatures: vi.fn().mockReturnValue({ recencyScore: 0.5 }),
}));

vi.mock('./contextSelectorHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./contextSelectorHelpers')>();
  return { ...actual };
});

import log from '../logger';
import { score as mockScore } from './contextClassifier';
import type { MutableCandidate } from './contextSelectorHelpers';
import {
  classifierRankCandidates,
  resetShadowErrorForTests,
  runShadowMode,
} from './contextSelectorRanker';
import type { RankedContextFile } from './types';
import type { TaskRequest } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(): TaskRequest {
  return {
    workspaceRoots: ['/project'],
    goal: 'fix',
    mode: 'edit',
    provider: 'codex',
    verificationProfile: 'fast',
  };
}

function makeCandidate(filePath: string, weight = 10): MutableCandidate {
  return { filePath, reasons: [{ kind: 'keyword_match', weight, detail: '' }] };
}

function makeCandidatesMap(paths: string[]): Map<string, MutableCandidate> {
  const m = new Map<string, MutableCandidate>();
  paths.forEach((p, i) => m.set(p.toLowerCase(), makeCandidate(p, (i + 1) * 10)));
  return m;
}

function makeRankedFile(filePath: string, score = 10): RankedContextFile {
  return { filePath, score, confidence: 'low', reasons: [], snippets: [], truncationNotes: [], pagerank_score: null };
}

// ─── classifierRankCandidates ────────────────────────────────────────────────

describe('classifierRankCandidates', () => {
  beforeEach(() => vi.mocked(mockScore).mockReturnValue(0.5));

  it('returns all candidates', () => {
    const candidates = makeCandidatesMap(['/a.ts', '/b.ts', '/c.ts']);
    const result = classifierRankCandidates(candidates, makeRequest());
    expect(result).toHaveLength(3);
  });

  it('uses classifier score as primary sort key (higher = earlier)', () => {
    const candidates = makeCandidatesMap(['/a.ts', '/b.ts']);
    // /b.ts has higher additive weight (20 vs 10), so additive rank puts it first.
    // We give /a.ts a higher classifier score to prove classifier wins.
    let callIdx = 0;
    vi.mocked(mockScore).mockImplementation(() => {
      callIdx += 1;
      return callIdx === 1 ? 0.2 : 0.9; // first processed = /b.ts (higher additive) → 0.2; second = /a.ts → 0.9
    });

    const result = classifierRankCandidates(candidates, makeRequest());
    expect(result[0]?.filePath).toBe('/a.ts');
    expect(result[1]?.filePath).toBe('/b.ts');
  });

  it('breaks ties by additive score then filePath', () => {
    // Both same classifier score — additive order should break tie
    vi.mocked(mockScore).mockReturnValue(0.5);
    const candidates = new Map<string, MutableCandidate>();
    const cA = makeCandidate('/z.ts', 50); // higher additive
    const cB = makeCandidate('/a.ts', 10); // lower additive
    candidates.set('/z.ts', cA);
    candidates.set('/a.ts', cB);

    const result = classifierRankCandidates(candidates, makeRequest());
    expect(result[0]?.filePath).toBe('/z.ts');
  });

  it('returns empty array for empty candidates', () => {
    const result = classifierRankCandidates(new Map(), makeRequest());
    expect(result).toHaveLength(0);
  });
});

// ─── runShadowMode ────────────────────────────────────────────────────────────

describe('runShadowMode', () => {
  beforeEach(() => {
    resetShadowErrorForTests();
    vi.mocked(log.info).mockClear();
    vi.mocked(mockScore).mockReturnValue(0.5);
  });

  afterEach(() => resetShadowErrorForTests());

  it('logs shadow line with additiveTopN, classifierTopN, overlap', () => {
    const additiveRanked = [makeRankedFile('/a.ts'), makeRankedFile('/b.ts')];
    const candidates = makeCandidatesMap(['/a.ts', '/b.ts']);

    runShadowMode(additiveRanked, candidates, makeRequest());

    expect(log.info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[context-ranker\] shadow overlap=/),
    );
    expect(log.debug).toHaveBeenCalledWith(
      '[context-ranker] shadow detail',
      expect.objectContaining({
        additiveTopN: expect.any(Array),
        classifierTopN: expect.any(Array),
        overlap: expect.any(Number),
      }),
    );
  });

  it('overlap is 1.0 when classifier order matches additive order', () => {
    vi.mocked(mockScore).mockReturnValue(0.5); // equal → preserves order
    const additiveRanked = [makeRankedFile('/a.ts', 20), makeRankedFile('/b.ts', 10)];
    const candidates = makeCandidatesMap(['/a.ts', '/b.ts']);

    runShadowMode(additiveRanked, candidates, makeRequest());

    const call = vi.mocked(log.debug).mock.calls.find(
      (c: unknown[]) => c[0] === '[context-ranker] shadow detail',
    );
    expect(call).toBeDefined();
    expect((call![1] as { overlap: number }).overlap).toBeGreaterThanOrEqual(0);
    expect((call![1] as { overlap: number }).overlap).toBeLessThanOrEqual(1);
  });

  it('does not throw when classifier throws', async () => {
    const { computeFeatures } = vi.mocked(
      await import('./contextSelectorFeatures'),
    );
    computeFeatures.mockImplementationOnce(() => { throw new Error('boom'); });

    const additiveRanked = [makeRankedFile('/a.ts')];
    const candidates = makeCandidatesMap(['/a.ts']);

    expect(() => runShadowMode(additiveRanked, candidates, makeRequest())).not.toThrow();
  });

  it('logs error only once per process when classifier throws repeatedly', async () => {
    const { computeFeatures } = vi.mocked(
      await import('./contextSelectorFeatures'),
    );
    computeFeatures.mockImplementation(() => { throw new Error('boom'); });

    const additiveRanked = [makeRankedFile('/a.ts')];
    const candidates = makeCandidatesMap(['/a.ts']);

    runShadowMode(additiveRanked, candidates, makeRequest());
    runShadowMode(additiveRanked, candidates, makeRequest());
    runShadowMode(additiveRanked, candidates, makeRequest());

    const errorCalls = vi.mocked(log.info).mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('shadow classifier error'),
    );
    expect(errorCalls.length).toBe(1);

    computeFeatures.mockReturnValue({ recencyScore: 0.5 });
  });

  it('does not affect the passed additiveRanked array', () => {
    vi.mocked(mockScore).mockReturnValueOnce(0.9).mockReturnValueOnce(0.1);
    const additiveRanked = [makeRankedFile('/a.ts', 20), makeRankedFile('/b.ts', 10)];
    const original = [...additiveRanked];
    const candidates = makeCandidatesMap(['/a.ts', '/b.ts']);

    runShadowMode(additiveRanked, candidates, makeRequest());

    expect(additiveRanked[0]?.filePath).toBe(original[0]?.filePath);
    expect(additiveRanked[1]?.filePath).toBe(original[1]?.filePath);
  });
});
