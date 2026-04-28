/**
 * hooksRankerReadTap.test.ts — Wave 53b Phase B
 *
 * Tests for the Read pre_tool_use hook tap that feeds ranker hit-rate telemetry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockNoteRead } = vi.hoisted(() => ({
  mockNoteRead: vi.fn(),
}));

vi.mock('./orchestration/contextRankerTelemetry', () => ({
  noteReadDuringSession: mockNoteRead,
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { HookPayload } from './hooks';
import { tapRankerRead } from './hooksRankerReadTap';

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'sess-1',
    toolName: 'Read',
    timestamp: Date.now(),
    cwd: '/workspace/project',
    input: { tool_input: { file_path: '/workspace/project/src/foo.ts' } },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tapRankerRead', () => {
  beforeEach(() => mockNoteRead.mockReset());
  afterEach(() => vi.clearAllMocks());
  it('calls noteReadDuringSession for a Read pre_tool_use event', () => {
    tapRankerRead(makePayload());
    expect(mockNoteRead).toHaveBeenCalledOnce();
    expect(mockNoteRead).toHaveBeenCalledWith(
      'sess-1',
      '/workspace/project/src/foo.ts',
      '/workspace/project',
    );
  });

  it('ignores non-pre_tool_use event types', () => {
    tapRankerRead(makePayload({ type: 'post_tool_use' as HookPayload['type'] }));
    expect(mockNoteRead).not.toHaveBeenCalled();
  });

  it('ignores non-Read tool names', () => {
    tapRankerRead(makePayload({ toolName: 'Grep' }));
    expect(mockNoteRead).not.toHaveBeenCalled();
  });

  it('ignores Read events with no file_path', () => {
    tapRankerRead(makePayload({ input: { tool_input: {} } }));
    expect(mockNoteRead).not.toHaveBeenCalled();
  });

  it('handles flat input (synthetic payloads without tool_input nesting)', () => {
    tapRankerRead(makePayload({ input: { file_path: '/workspace/project/src/bar.ts' } }));
    expect(mockNoteRead).toHaveBeenCalledWith(
      'sess-1',
      '/workspace/project/src/bar.ts',
      '/workspace/project',
    );
  });

  it('falls back to empty string when cwd is absent', () => {
    const payload = makePayload();
    delete payload.cwd;
    tapRankerRead(payload);
    expect(mockNoteRead).toHaveBeenCalledWith('sess-1', '/workspace/project/src/foo.ts', '');
  });

  it('does not throw when noteReadDuringSession throws', () => {
    mockNoteRead.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => tapRankerRead(makePayload())).not.toThrow();
  });
});
