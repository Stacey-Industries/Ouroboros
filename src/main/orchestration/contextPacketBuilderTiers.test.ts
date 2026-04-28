/**
 * contextPacketBuilderTiers.test.ts
 *
 * Smoke tests for the tier-based file group builder extracted from
 * contextPacketBuilder.ts (Wave 53b Phase B refactor).
 */

import { describe, expect, it, vi } from 'vitest';

import type { ContextSelectionResult } from './contextSelector';
import type { OmittedContextCandidate, RankedContextFile } from './types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./contextPacketBuilderHelpers', () => ({
  buildFilePayload: vi.fn(),
}));

vi.mock('./contextPacketBuilderSupport', () => ({
  DEFAULT_MAX_BYTES: 200_000,
  DEFAULT_TIER_BUDGET: { tier1MaxPercent: 0.6 },
  getFileTier: vi.fn((file: RankedContextFile) => {
    // tier 1 if score >= 80
    return file.score >= 80 ? 1 : 2;
  }),
}));

import { buildFilePayload } from './contextPacketBuilderHelpers';
import { buildFilesForGroup, buildPacketFiles, scopedBudget } from './contextPacketBuilderTiers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBudget(estimatedBytes = 0, byteLimit = 200_000) {
  return {
    estimatedBytes,
    estimatedTokens: 0,
    byteLimit,
    tokenLimit: undefined as number | undefined,
    droppedContentNotes: [] as string[],
  };
}

function makeFile(filePath: string, score: number): RankedContextFile {
  return {
    filePath,
    score,
    confidence: 'medium',
    reasons: [],
    snippets: [],
    truncationNotes: [],
    pagerank_score: 0,
  };
}

function makeSelection(files: RankedContextFile[]): ContextSelectionResult {
  return {
    rankedFiles: files,
    omittedCandidates: [] as OmittedContextCandidate[],
    liveIdeState: {
      openFiles: [],
      dirtyFiles: [],
      dirtyBuffers: [],
      selectedFiles: [],
      collectedAt: 0,
    },
    snapshots: {},
    rankingInputs: {
      userSelectedFiles: [],
      pinnedFiles: [],
      includedFiles: [],
      excludedFiles: [],
      openFiles: [],
      dirtyFiles: [],
      recentEdits: [],
      diffFiles: [],
      diagnosticFiles: [],
      keywordMatches: [],
    },
  };
}

// ---------------------------------------------------------------------------
// scopedBudget
// ---------------------------------------------------------------------------

describe('scopedBudget', () => {
  it('uses the parent byteLimit when maxBytes is larger', () => {
    const parent = makeBudget(0, 100_000);
    const scoped = scopedBudget(parent, 200_000);
    expect(scoped.byteLimit).toBe(100_000);
  });

  it('uses maxBytes when it is smaller than parent byteLimit', () => {
    const parent = makeBudget(0, 100_000);
    const scoped = scopedBudget(parent, 40_000);
    expect(scoped.byteLimit).toBe(40_000);
  });

  it('shares the droppedContentNotes array with the parent', () => {
    const parent = makeBudget();
    const scoped = scopedBudget(parent, 50_000);
    expect(scoped.droppedContentNotes).toBe(parent.droppedContentNotes);
  });

  it('copies estimatedBytes from parent', () => {
    const parent = makeBudget(12_345);
    const scoped = scopedBudget(parent, 200_000);
    expect(scoped.estimatedBytes).toBe(12_345);
  });
});

// ---------------------------------------------------------------------------
// buildFilesForGroup
// ---------------------------------------------------------------------------

describe('buildFilesForGroup', () => {
  it('accepts files when under maxFiles', async () => {
    const file = makeFile('a.ts', 50);
    const payload = makeFile('a.ts', 50);
    vi.mocked(buildFilePayload).mockResolvedValue(payload);

    const budget = makeBudget();
    const opts = {
      selection: makeSelection([file]),
      maxFiles: 5,
      maxSnippetsPerFile: 3,
      budget,
    };
    const result = await buildFilesForGroup([file], opts, budget, []);
    expect(result.files).toHaveLength(1);
    expect(result.omittedCandidates).toHaveLength(0);
  });

  it('omits files when maxFiles is already reached', async () => {
    const file = makeFile('b.ts', 50);
    const budget = makeBudget();
    const currentFiles = [makeFile('existing.ts', 50)];
    const opts = {
      selection: makeSelection([]),
      maxFiles: 1,
      maxSnippetsPerFile: 3,
      budget,
    };
    const result = await buildFilesForGroup([file], opts, budget, currentFiles);
    expect(result.files).toHaveLength(0);
    expect(result.omittedCandidates).toHaveLength(1);
    expect(result.omittedCandidates[0].reason).toMatch(/maxFiles/);
  });

  it('omits files when buildFilePayload returns null', async () => {
    const file = makeFile('c.ts', 50);
    vi.mocked(buildFilePayload).mockResolvedValue(null);

    const budget = makeBudget();
    const opts = {
      selection: makeSelection([file]),
      maxFiles: 5,
      maxSnippetsPerFile: 3,
      budget,
    };
    const result = await buildFilesForGroup([file], opts, budget, []);
    expect(result.files).toHaveLength(0);
    expect(result.omittedCandidates).toHaveLength(1);
    expect(result.omittedCandidates[0].reason).toMatch(/snippets/i);
  });

  it('tracks bytesUsed from budget delta', async () => {
    const file = makeFile('d.ts', 50);
    const payload = makeFile('d.ts', 50);
    vi.mocked(buildFilePayload).mockImplementation(async ({ budget }) => {
      budget.estimatedBytes += 1000;
      return payload;
    });

    const budget = makeBudget(0);
    const opts = {
      selection: makeSelection([file]),
      maxFiles: 5,
      maxSnippetsPerFile: 3,
      budget,
    };
    const result = await buildFilesForGroup([file], opts, budget, []);
    expect(result.bytesUsed).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// buildPacketFiles
// ---------------------------------------------------------------------------

describe('buildPacketFiles', () => {
  it('splits files into tier1 and other by score', async () => {
    const tier1 = makeFile('high.ts', 90); // score >= 80 → tier 1
    const tier2 = makeFile('low.ts', 40); // score < 80 → tier 2
    vi.mocked(buildFilePayload).mockImplementation(async ({ rankedFile }) =>
      makeFile(rankedFile.filePath, rankedFile.score),
    );

    const selection = makeSelection([tier1, tier2]);
    const budget = makeBudget();
    const opts = {
      selection,
      maxFiles: 10,
      maxSnippetsPerFile: 3,
      budget,
    };
    const result = await buildPacketFiles(opts);
    const paths = result.files.map((f) => f.filePath);
    expect(paths).toContain('high.ts');
    expect(paths).toContain('low.ts');
  });

  it('merges omittedCandidates from selection and both tiers', async () => {
    const file = makeFile('z.ts', 50);
    vi.mocked(buildFilePayload).mockResolvedValue(null);

    const selection = makeSelection([file]);
    selection.omittedCandidates.push({ filePath: 'pre-omitted.ts', reason: 'pre-omitted' });
    const budget = makeBudget();
    const opts = {
      selection,
      maxFiles: 10,
      maxSnippetsPerFile: 3,
      budget,
    };
    const result = await buildPacketFiles(opts);
    const paths = result.omittedCandidates.map((o) => o.filePath);
    expect(paths).toContain('pre-omitted.ts');
    expect(paths).toContain('z.ts');
  });

  it('records tierAllocation on the budget after building', async () => {
    const file = makeFile('t.ts', 90);
    vi.mocked(buildFilePayload).mockResolvedValue(makeFile('t.ts', 90));

    const budget = makeBudget();
    const opts = {
      selection: makeSelection([file]),
      maxFiles: 10,
      maxSnippetsPerFile: 3,
      budget,
    };
    await buildPacketFiles(opts);
    expect(budget).toHaveProperty('tierAllocation');
    expect((budget as { tierAllocation?: unknown }).tierAllocation).toHaveProperty('tier1');
    expect((budget as { tierAllocation?: unknown }).tierAllocation).toHaveProperty('tier2Plus');
  });
});
