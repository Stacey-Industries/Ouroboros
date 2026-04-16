/**
 * contextPacketBuilderDecisions.test.ts — Unit tests for emitDecisionsForPacket.
 *
 * Mocks contextSignalCollector so no real writer or config is involved.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockEmitContextDecisions } = vi.hoisted(() => ({
  mockEmitContextDecisions: vi.fn(),
}));

vi.mock('./contextSignalCollector', () => ({
  emitContextDecisions: mockEmitContextDecisions,
}));

import { emitDecisionsForPacket } from './contextPacketBuilderDecisions';
import type { ContextSelectionResult } from './contextSelector';
import type { RankedContextFile } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRankedFile(filePath: string, score: number): RankedContextFile {
  return {
    filePath,
    score,
    reasons: [{ kind: 'git_diff', weight: score }],
    confidence: 'high',
    snippets: [],
  } as unknown as RankedContextFile;
}

function makeSelection(rankedFiles: RankedContextFile[]): ContextSelectionResult {
  return {
    rankedFiles,
    omittedCandidates: [],
    snapshots: {},
    liveIdeState: undefined,
  } as unknown as ContextSelectionResult;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('emitDecisionsForPacket', () => {
  beforeEach(() => {
    mockEmitContextDecisions.mockClear();
  });

  it('is a no-op when traceId is undefined', () => {
    const selection = makeSelection([makeRankedFile('src/a.ts', 50)]);
    emitDecisionsForPacket(undefined, selection, []);
    expect(mockEmitContextDecisions).not.toHaveBeenCalled();
  });

  it('is a no-op when traceId is empty string', () => {
    const selection = makeSelection([makeRankedFile('src/a.ts', 50)]);
    emitDecisionsForPacket('', selection, []);
    expect(mockEmitContextDecisions).not.toHaveBeenCalled();
  });

  it('calls emitContextDecisions once with the traceId', () => {
    const selection = makeSelection([makeRankedFile('src/a.ts', 56)]);
    emitDecisionsForPacket('trace-abc', selection, [makeRankedFile('src/a.ts', 56)]);

    expect(mockEmitContextDecisions).toHaveBeenCalledOnce();
    expect(mockEmitContextDecisions).toHaveBeenCalledWith(
      'trace-abc',
      expect.any(Array),
      expect.any(Array),
    );
  });

  it('marks files present in the packet as included=true', () => {
    const file = makeRankedFile('src/b.ts', 70);
    const selection = makeSelection([file]);
    emitDecisionsForPacket('trace-1', selection, [file]);

    const [, features, final] = mockEmitContextDecisions.mock.calls[0];
    expect(features[0].included).toBe(true);
    expect(final[0].included).toBe(true);
  });

  it('marks files absent from the packet as included=false', () => {
    const file = makeRankedFile('src/c.ts', 30);
    const selection = makeSelection([file]);
    // Pass empty files array — nothing made the packet
    emitDecisionsForPacket('trace-2', selection, []);

    const [, features, final] = mockEmitContextDecisions.mock.calls[0];
    expect(features[0].included).toBe(false);
    expect(final[0].included).toBe(false);
  });

  it('passes correct fileId and score in the final array', () => {
    const file = makeRankedFile('src/d.ts', 88);
    const selection = makeSelection([file]);
    emitDecisionsForPacket('trace-3', selection, [file]);

    const [, , final] = mockEmitContextDecisions.mock.calls[0];
    expect(final[0]).toMatchObject({ fileId: 'src/d.ts', score: 88 });
  });

  it('maps reasons into feature vectors', () => {
    const file = makeRankedFile('src/e.ts', 56);
    const selection = makeSelection([file]);
    emitDecisionsForPacket('trace-4', selection, [file]);

    const [, features] = mockEmitContextDecisions.mock.calls[0];
    expect(features[0].reasons).toEqual([{ kind: 'git_diff', weight: 56 }]);
  });

  it('handles multiple ranked files, mixing included and excluded', () => {
    const included = makeRankedFile('src/f.ts', 90);
    const excluded = makeRankedFile('src/g.ts', 20);
    const selection = makeSelection([included, excluded]);
    emitDecisionsForPacket('trace-5', selection, [included]);

    const [, , final] = mockEmitContextDecisions.mock.calls[0];
    expect(final).toHaveLength(2);
    expect(final[0]).toMatchObject({ fileId: 'src/f.ts', included: true });
    expect(final[1]).toMatchObject({ fileId: 'src/g.ts', included: false });
  });

  it('passes pagerank_score: null when not present on the ranked file', () => {
    const file = makeRankedFile('src/h.ts', 40);
    const selection = makeSelection([file]);
    emitDecisionsForPacket('trace-6', selection, [file]);

    const [, features] = mockEmitContextDecisions.mock.calls[0];
    expect(features[0].pagerank_score).toBeNull();
  });
});
