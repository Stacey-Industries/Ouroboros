/**
 * hooksEditTap.test.ts — Unit tests for hooksEditTap.ts
 *
 * Wave 30 Phase D (extracted from hooks.ts to satisfy max-lines limit).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockRecordEdit = vi.fn();
const mockMarkAgentEdit = vi.fn();

vi.mock('./agentConflict/conflictMonitor', () => ({
  getConflictMonitor: () => ({ recordEdit: mockRecordEdit }),
}));

vi.mock('./orchestration/editProvenance', () => ({
  getEditProvenanceStore: () => ({ markAgentEdit: mockMarkAgentEdit }),
}));

vi.mock('./logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import { tapConflictMonitor, tapEditProvenance } from './hooksEditTap';
import type { HookPayload } from './hooks';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'post_tool_use',
    sessionId: 'sess-1',
    toolName: 'Edit',
    correlationId: 'corr-1',
    input: { file_path: '/workspace/foo.ts' },
    timestamp: Date.now(),
    ...overrides,
  };
}

const cwdMap = new Map([['sess-1', '/workspace']]);

// ─── tapConflictMonitor ───────────────────────────────────────────────────────

describe('tapConflictMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRecordEdit.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('does nothing for pre_tool_use', () => {
    tapConflictMonitor(makePayload({ type: 'pre_tool_use' }), cwdMap);
    vi.runAllTimers();
    expect(mockRecordEdit).not.toHaveBeenCalled();
  });

  it('does nothing for non-edit tools', () => {
    tapConflictMonitor(makePayload({ toolName: 'Bash' }), cwdMap);
    vi.runAllTimers();
    expect(mockRecordEdit).not.toHaveBeenCalled();
  });

  it('does nothing when file path is absent', () => {
    tapConflictMonitor(makePayload({ input: {} }), cwdMap);
    vi.runAllTimers();
    expect(mockRecordEdit).not.toHaveBeenCalled();
  });

  it('calls recordEdit for Edit tool via setImmediate', () => {
    tapConflictMonitor(makePayload({ toolName: 'Edit' }), cwdMap);
    expect(mockRecordEdit).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(mockRecordEdit).toHaveBeenCalledWith('/workspace', 'sess-1', '/workspace/foo.ts');
  });

  it('calls recordEdit for Write tool', () => {
    tapConflictMonitor(makePayload({ toolName: 'Write' }), cwdMap);
    vi.runAllTimers();
    expect(mockRecordEdit).toHaveBeenCalledOnce();
  });

  it('calls recordEdit for MultiEdit tool', () => {
    tapConflictMonitor(makePayload({ toolName: 'MultiEdit' }), cwdMap);
    vi.runAllTimers();
    expect(mockRecordEdit).toHaveBeenCalledOnce();
  });

  it('reads path from input.path when file_path absent', () => {
    tapConflictMonitor(makePayload({ input: { path: '/other/bar.ts' } }), cwdMap);
    vi.runAllTimers();
    expect(mockRecordEdit).toHaveBeenCalledWith('/workspace', 'sess-1', '/other/bar.ts');
  });

  it('uses empty string for cwd when session not in map', () => {
    tapConflictMonitor(makePayload({ sessionId: 'unknown' }), cwdMap);
    vi.runAllTimers();
    expect(mockRecordEdit).toHaveBeenCalledWith('', 'unknown', '/workspace/foo.ts');
  });

  it('does not throw when recordEdit throws', () => {
    mockRecordEdit.mockImplementation(() => { throw new Error('db error'); });
    tapConflictMonitor(makePayload(), cwdMap);
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});

// ─── tapEditProvenance ────────────────────────────────────────────────────────

describe('tapEditProvenance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMarkAgentEdit.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('does nothing for pre_tool_use', () => {
    tapEditProvenance(makePayload({ type: 'pre_tool_use' }));
    vi.runAllTimers();
    expect(mockMarkAgentEdit).not.toHaveBeenCalled();
  });

  it('does nothing for non-edit tools', () => {
    tapEditProvenance(makePayload({ toolName: 'Task' }));
    vi.runAllTimers();
    expect(mockMarkAgentEdit).not.toHaveBeenCalled();
  });

  it('does nothing when file path is absent', () => {
    tapEditProvenance(makePayload({ input: {} }));
    vi.runAllTimers();
    expect(mockMarkAgentEdit).not.toHaveBeenCalled();
  });

  it('calls markAgentEdit via setImmediate', () => {
    tapEditProvenance(makePayload());
    expect(mockMarkAgentEdit).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(mockMarkAgentEdit).toHaveBeenCalledWith('/workspace/foo.ts', 'corr-1');
  });

  it('passes undefined correlationId when absent', () => {
    tapEditProvenance(makePayload({ correlationId: undefined }));
    vi.runAllTimers();
    expect(mockMarkAgentEdit).toHaveBeenCalledWith('/workspace/foo.ts', undefined);
  });

  it('does not throw when markAgentEdit throws', () => {
    mockMarkAgentEdit.mockImplementation(() => { throw new Error('provenance error'); });
    tapEditProvenance(makePayload());
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
