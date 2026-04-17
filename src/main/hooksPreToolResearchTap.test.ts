/**
 * hooksPreToolResearchTap.test.ts — Unit tests for hooksPreToolResearchTap.ts
 *
 * Wave 30 Phase D.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const { mockMaybeFire } = vi.hoisted(() => ({ mockMaybeFire: vi.fn() }));

vi.mock('./research/preToolResearchOrchestrator', () => ({
  maybeFireResearchForPreTool: mockMaybeFire,
}));

vi.mock('./logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import type { HookPayload } from './hooks';
import { tapPreToolResearch } from './hooksPreToolResearchTap';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'sess-1',
    toolName: 'Edit',
    toolCallId: 'call-1',
    correlationId: 'corr-1',
    input: { file_path: '/workspace/foo.ts' },
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tapPreToolResearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMaybeFire.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing for post_tool_use events', () => {
    tapPreToolResearch(makePayload({ type: 'post_tool_use' }));
    vi.runAllTimers();
    expect(mockMaybeFire).not.toHaveBeenCalled();
  });

  it('does nothing for non-edit tools', () => {
    tapPreToolResearch(makePayload({ toolName: 'Bash' }));
    vi.runAllTimers();
    expect(mockMaybeFire).not.toHaveBeenCalled();
  });

  it('does nothing when toolName is absent', () => {
    tapPreToolResearch(makePayload({ toolName: undefined }));
    vi.runAllTimers();
    expect(mockMaybeFire).not.toHaveBeenCalled();
  });

  it('does nothing when file path is absent', () => {
    tapPreToolResearch(makePayload({ input: {} }));
    vi.runAllTimers();
    expect(mockMaybeFire).not.toHaveBeenCalled();
  });

  it('fires for Edit tool with file_path', () => {
    tapPreToolResearch(makePayload({ toolName: 'Edit' }));
    vi.runAllTimers();
    expect(mockMaybeFire).toHaveBeenCalledOnce();
    expect(mockMaybeFire).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      toolUseId: 'call-1',
      filePath: '/workspace/foo.ts',
      correlationId: 'corr-1',
    });
  });

  it('fires for Write tool', () => {
    tapPreToolResearch(makePayload({ toolName: 'Write' }));
    vi.runAllTimers();
    expect(mockMaybeFire).toHaveBeenCalledOnce();
  });

  it('fires for MultiEdit tool', () => {
    tapPreToolResearch(makePayload({ toolName: 'MultiEdit' }));
    vi.runAllTimers();
    expect(mockMaybeFire).toHaveBeenCalledOnce();
  });

  it('reads path from input.path when file_path is absent', () => {
    tapPreToolResearch(makePayload({ input: { path: '/workspace/bar.ts' } }));
    vi.runAllTimers();
    expect(mockMaybeFire).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/workspace/bar.ts' }),
    );
  });

  it('returns synchronously — maybeFireResearchForPreTool called via setImmediate', () => {
    // Before timers run, not yet called
    tapPreToolResearch(makePayload());
    expect(mockMaybeFire).not.toHaveBeenCalled();
    // After setImmediate fires
    vi.runAllTimers();
    expect(mockMaybeFire).toHaveBeenCalledOnce();
  });

  it('does not throw when maybeFireResearchForPreTool throws', () => {
    mockMaybeFire.mockImplementation(() => { throw new Error('boom'); });
    tapPreToolResearch(makePayload());
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
