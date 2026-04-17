/**
 * contextOutcomeObserverResearch.test.ts — Unit tests for research attribution helper
 * (Wave 25 Phase D, extended Wave 29.5 Phase F for H3).
 *
 * Mocks researchCorrelation, researchOutcomeWriter, and
 * chatOrchestrationBridgeGit to test wiring without real I/O or singletons.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAttributeOutcome,
  mockSummarizeSession,
  mockGetCorrelationStore,
  mockRecordOutcome,
  mockGetWriter,
  mockRegisterRevertListener,
  capturedRevertListeners,
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

  // Capture registered listeners so tests can fire them directly
  const capturedRevertListeners: Array<(paths: string[]) => void> = [];
  const mockRegisterRevertListener = vi.fn((fn: (paths: string[]) => void) => {
    capturedRevertListeners.push(fn);
    return () => {
      const idx = capturedRevertListeners.indexOf(fn);
      if (idx !== -1) capturedRevertListeners.splice(idx, 1);
    };
  });

  return {
    mockAttributeOutcome,
    mockSummarizeSession,
    mockGetCorrelationStore,
    mockRecordOutcome,
    mockGetWriter,
    mockRegisterRevertListener,
    capturedRevertListeners,
  };
});

vi.mock('../research/researchCorrelation', () => ({
  getResearchCorrelationStore: mockGetCorrelationStore,
}));

vi.mock('../research/researchOutcomeWriter', () => ({
  getResearchOutcomeWriter: mockGetWriter,
}));

vi.mock('../agentChat/chatOrchestrationBridgeGit', () => ({
  registerRevertListener: mockRegisterRevertListener,
}));

import {
  _resetResearchOutcomeObserverSignalsForTests,
  attributeResearchOutcome,
  initResearchOutcomeObserverSignals,
  notifyPtyExit,
} from './contextOutcomeObserverResearch';

// ─── Setup helpers ────────────────────────────────────────────────────────────

function fireRevert(paths: string[]): void {
  for (const fn of capturedRevertListeners) fn(paths);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attributeResearchOutcome — baseline (no Phase F signals)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRevertListeners.length = 0;
    _resetResearchOutcomeObserverSignalsForTests();
    mockAttributeOutcome.mockReturnValue(null);
    mockSummarizeSession.mockReturnValue([]);
    mockGetWriter.mockReturnValue({ recordOutcome: mockRecordOutcome });
  });

  it('does not call the writer when attributeOutcome returns null', () => {
    mockAttributeOutcome.mockReturnValue(null);
    attributeResearchOutcome('sess-1', 'Edit', '/a.ts');
    expect(mockRecordOutcome).not.toHaveBeenCalled();
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

  it('does not throw when the correlation store throws', () => {
    mockGetCorrelationStore.mockImplementationOnce(() => {
      throw new Error('store unavailable');
    });
    expect(() => attributeResearchOutcome('sess-1', 'Edit', '/a.ts')).not.toThrow();
  });
});

describe('attributeResearchOutcome — Phase F: outcomeSignal derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRevertListeners.length = 0;
    _resetResearchOutcomeObserverSignalsForTests();
    mockGetWriter.mockReturnValue({ recordOutcome: mockRecordOutcome });
    initResearchOutcomeObserverSignals();
  });

  function setupAttribution(correlationId: string, topic: string): void {
    mockAttributeOutcome.mockReturnValue(correlationId);
    mockSummarizeSession.mockReturnValue([{ correlationId, topic, touchCount: 1 }]);
  }

  it('records outcomeSignal: "accepted" when an Edit is not reverted', () => {
    setupAttribution('cid-1', 'react hooks');
    attributeResearchOutcome('sess-1', 'Edit', '/src/app.tsx');
    expect(mockRecordOutcome).toHaveBeenCalledOnce();
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.outcomeSignal).toBe('accepted');
    expect(args.toolKind).toBe('edit');
    expect(args.schemaVersion).toBeUndefined(); // writer adds it, not the observer
  });

  it('records outcomeSignal: "accepted" for Write tool', () => {
    setupAttribution('cid-2', 'prisma schema');
    attributeResearchOutcome('sess-2', 'Write', '/schema.prisma');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.outcomeSignal).toBe('accepted');
    expect(args.toolKind).toBe('write');
  });

  it('records outcomeSignal: "unknown" for Read-only tool', () => {
    setupAttribution('cid-3', 'vite docs');
    attributeResearchOutcome('sess-3', 'Read', '/vite.config.ts');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.outcomeSignal).toBe('unknown');
    expect(args.toolKind).toBe('read');
  });

  it('records outcomeSignal: "reverted" when revert fires on the attributed file', () => {
    setupAttribution('cid-4', 'tailwind');
    // Prime session signals
    attributeResearchOutcome('sess-4', 'Edit', '/styles.ts');
    mockRecordOutcome.mockClear();
    // Now fire a revert covering that file
    fireRevert(['/styles.ts']);
    // Next attribution in same session should see "reverted"
    setupAttribution('cid-4', 'tailwind');
    attributeResearchOutcome('sess-4', 'Edit', '/styles.ts');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.outcomeSignal).toBe('reverted');
  });

  it('records outcomeSignal: "accepted" when revert does NOT cover the attributed file', () => {
    setupAttribution('cid-5', 'vitest');
    // Revert fires on a different file
    fireRevert(['/other.ts']);
    attributeResearchOutcome('sess-5', 'Edit', '/target.ts');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.outcomeSignal).toBe('accepted');
  });

  it('records followupTestExit: null when no PTY exit has occurred', () => {
    setupAttribution('cid-6', 'jest');
    attributeResearchOutcome('sess-6', 'Edit', '/test.ts');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.followupTestExit).toBeNull();
  });

  it('records followupTestExit from notifyPtyExit when called before attribution', () => {
    // Prime session signals first by doing an attribution
    setupAttribution('cid-7', 'vitest');
    attributeResearchOutcome('sess-7', 'Edit', '/a.ts');
    mockRecordOutcome.mockClear();
    // PTY exits with code 0
    notifyPtyExit('sess-7', 0);
    // Next attribution captures the exit code
    setupAttribution('cid-7', 'vitest');
    attributeResearchOutcome('sess-7', 'Edit', '/b.ts');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.followupTestExit).toBe(0);
  });

  it('records followupTestExit: 1 for a failing test run', () => {
    setupAttribution('cid-8', 'vitest');
    attributeResearchOutcome('sess-8', 'Edit', '/a.ts');
    mockRecordOutcome.mockClear();
    notifyPtyExit('sess-8', 1);
    setupAttribution('cid-8', 'vitest');
    attributeResearchOutcome('sess-8', 'Edit', '/b.ts');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.followupTestExit).toBe(1);
  });

  it('passes the correct toolKind and filePath to the writer', () => {
    setupAttribution('cid-9', 'zod');
    attributeResearchOutcome('sess-9', 'MultiEdit', '/schema.ts');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.toolKind).toBe('edit');
    expect(args.filePath).toBe('/schema.ts');
    expect(args.correlationId).toBe('cid-9');
    expect(args.sessionId).toBe('sess-9');
  });

  it('handles "other" toolKind (Bash) as unknown signal', () => {
    setupAttribution('cid-10', 'bash');
    attributeResearchOutcome('sess-10', 'Bash', '/run.sh');
    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.toolKind).toBe('other');
    expect(args.outcomeSignal).toBe('unknown');
  });
});

describe('initResearchOutcomeObserverSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRevertListeners.length = 0;
    _resetResearchOutcomeObserverSignalsForTests();
  });

  it('registers a revert listener on init', () => {
    initResearchOutcomeObserverSignals();
    expect(mockRegisterRevertListener).toHaveBeenCalledOnce();
    expect(capturedRevertListeners).toHaveLength(1);
  });

  it('is idempotent — calling init twice only registers one listener', () => {
    initResearchOutcomeObserverSignals();
    initResearchOutcomeObserverSignals();
    expect(mockRegisterRevertListener).toHaveBeenCalledOnce();
  });
});

describe('chatOrchestrationBridgeGit revert hook fires with reverted paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRevertListeners.length = 0;
    _resetResearchOutcomeObserverSignalsForTests();
    mockGetWriter.mockReturnValue({ recordOutcome: mockRecordOutcome });
    initResearchOutcomeObserverSignals();
  });

  it('revert listener receives the file paths from fireRevert', () => {
    // Prime a session so signals exist
    mockAttributeOutcome.mockReturnValue('cid-1');
    mockSummarizeSession.mockReturnValue([{ correlationId: 'cid-1', topic: 'x', touchCount: 1 }]);
    attributeResearchOutcome('sess-revert', 'Edit', '/reverted-file.ts');
    mockRecordOutcome.mockClear();

    // Fire the revert signal as the bridge would
    fireRevert(['/reverted-file.ts', '/other.ts']);

    // Next attribution on that file should be "reverted"
    mockAttributeOutcome.mockReturnValue('cid-1');
    mockSummarizeSession.mockReturnValue([{ correlationId: 'cid-1', topic: 'x', touchCount: 2 }]);
    attributeResearchOutcome('sess-revert', 'Edit', '/reverted-file.ts');

    const args = mockRecordOutcome.mock.calls[0][0];
    expect(args.outcomeSignal).toBe('reverted');
  });
});
