/**
 * contextOutcomeObserverResearch.test.ts — Unit tests for research attribution helper
 * (Wave 25 Phase D).
 *
 * Mocks both researchCorrelation and researchOutcomeWriter to test the wiring
 * without real I/O or singletons.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to file top, so mock fns must be created inside
// vi.hoisted() to be accessible before variable declarations run.

const {
  mockAttributeOutcome,
  mockSummarizeSession,
  mockGetCorrelationStore,
  mockRecordOutcome,
  mockGetWriter,
} = vi.hoisted(() => {
  const mockAttributeOutcome = vi.fn<
    (sessionId: string, toolName: string, filePath: string) => string | null
  >(() => null);
  const mockSummarizeSession = vi.fn<
    (sessionId: string) => Array<{ correlationId: string; topic: string; touchCount: number }>
  >(() => []);
  const mockGetCorrelationStore = vi.fn(() => ({
    attributeOutcome: mockAttributeOutcome,
    summarizeSession: mockSummarizeSession,
    recordInvocation: vi.fn(),
    _resetForTests: vi.fn(),
  }));
  const mockRecordOutcome = vi.fn();
  const mockGetWriter = vi.fn<() => { recordOutcome: typeof mockRecordOutcome } | null>(
    () => ({ recordOutcome: mockRecordOutcome }),
  );
  return { mockAttributeOutcome, mockSummarizeSession, mockGetCorrelationStore, mockRecordOutcome, mockGetWriter };
});

vi.mock('../research/researchCorrelation', () => ({
  getResearchCorrelationStore: mockGetCorrelationStore,
}));

vi.mock('../research/researchOutcomeWriter', () => ({
  getResearchOutcomeWriter: mockGetWriter,
}));

import { attributeResearchOutcome } from './contextOutcomeObserverResearch';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attributeResearchOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAttributeOutcome.mockReturnValue(null);
    mockSummarizeSession.mockReturnValue([]);
    mockGetWriter.mockReturnValue({ recordOutcome: mockRecordOutcome });
  });

  it('does not call the writer when attributeOutcome returns null', () => {
    mockAttributeOutcome.mockReturnValue(null);
    attributeResearchOutcome('sess-1', 'Edit', '/a.ts');
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });

  it('calls the writer when attribution succeeds', () => {
    mockAttributeOutcome.mockReturnValue('cid-1');
    mockSummarizeSession.mockReturnValue([
      { correlationId: 'cid-1', topic: 'react hooks', touchCount: 1 },
    ]);
    attributeResearchOutcome('sess-1', 'Edit', '/src/app.tsx');
    expect(mockRecordOutcome).toHaveBeenCalledOnce();
    expect(mockRecordOutcome).toHaveBeenCalledWith({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'react hooks',
      toolName: 'Edit', filePath: '/src/app.tsx',
    });
  });

  it('does not throw when the writer is not initialised', () => {
    mockAttributeOutcome.mockReturnValue('cid-1');
    mockSummarizeSession.mockReturnValue([
      { correlationId: 'cid-1', topic: 'prisma', touchCount: 1 },
    ]);
    mockGetWriter.mockReturnValue(null);
    expect(() => attributeResearchOutcome('sess-1', 'Write', '/b.ts')).not.toThrow();
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });

  it('does not throw when summarizeSession has no matching entry', () => {
    mockAttributeOutcome.mockReturnValue('cid-unknown');
    mockSummarizeSession.mockReturnValue([]);
    expect(() => attributeResearchOutcome('sess-1', 'Edit', '/c.ts')).not.toThrow();
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });

  it('passes the correct arguments to attributeOutcome', () => {
    attributeResearchOutcome('my-session', 'Write', '/path/file.ts');
    expect(mockAttributeOutcome).toHaveBeenCalledWith('my-session', 'Write', '/path/file.ts');
  });

  it('does not throw when the correlation store throws', () => {
    mockGetCorrelationStore.mockImplementationOnce(() => {
      throw new Error('store unavailable');
    });
    expect(() => attributeResearchOutcome('sess-1', 'Edit', '/a.ts')).not.toThrow();
  });
});
