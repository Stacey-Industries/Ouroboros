/**
 * hooksContextOutcome.test.ts — Unit tests for the hooks → outcome observer tap.
 *
 * Mocks both logger and the contextOutcomeObserver functions so no real
 * filesystem or module state is touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Use vi.hoisted so the mock variables are available before vi.mock hoisting.
const { mockObserveToolCallBySession, mockRecordTurnEndBySession } = vi.hoisted(() => ({
  mockObserveToolCallBySession: vi.fn(),
  mockRecordTurnEndBySession: vi.fn(),
}));

vi.mock('./orchestration/contextOutcomeObserver', () => ({
  observeToolCallBySession: mockObserveToolCallBySession,
  recordTurnEndBySession: mockRecordTurnEndBySession,
}));

import type { HookPayload } from './hooks';
import { tapContextOutcomeObserver } from './hooksContextOutcome';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<HookPayload>): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'sess-1',
    timestamp: Date.now(),
    ...overrides,
  } as HookPayload;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockObserveToolCallBySession.mockClear();
  mockRecordTurnEndBySession.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('tapContextOutcomeObserver — post_tool_use', () => {
  it('calls observeToolCallBySession with sessionId, toolName and file_path arg', async () => {
    const payload = makePayload({
      type: 'post_tool_use',
      sessionId: 'sess-1',
      toolName: 'Edit',
      input: { file_path: 'src/foo.ts' },
    });

    tapContextOutcomeObserver(payload);
    await vi.runAllTimersAsync();

    expect(mockObserveToolCallBySession).toHaveBeenCalledOnce();
    expect(mockObserveToolCallBySession).toHaveBeenCalledWith('sess-1', 'Edit', {
      path: undefined,
      filePath: undefined,
      file_path: 'src/foo.ts',
    });
  });

  it('passes path arg when tool uses `path` field', async () => {
    const payload = makePayload({
      type: 'post_tool_use',
      toolName: 'Read',
      input: { path: 'src/bar.ts' },
    });

    tapContextOutcomeObserver(payload);
    await vi.runAllTimersAsync();

    expect(mockObserveToolCallBySession).toHaveBeenCalledWith(
      expect.any(String),
      'Read',
      expect.objectContaining({ path: 'src/bar.ts' }),
    );
  });

  it('does not call recordTurnEndBySession on post_tool_use', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'post_tool_use', toolName: 'Read' }));
    await vi.runAllTimersAsync();

    expect(mockRecordTurnEndBySession).not.toHaveBeenCalled();
  });

  it('is a no-op when toolName is absent on post_tool_use', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'post_tool_use', toolName: undefined }));
    await vi.runAllTimersAsync();

    expect(mockObserveToolCallBySession).not.toHaveBeenCalled();
  });
});

describe('tapContextOutcomeObserver — turn end events', () => {
  it('calls recordTurnEndBySession on agent_end', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'agent_end', sessionId: 'sess-2' }));
    await vi.runAllTimersAsync();

    expect(mockRecordTurnEndBySession).toHaveBeenCalledOnce();
    expect(mockRecordTurnEndBySession).toHaveBeenCalledWith('sess-2');
  });

  it('calls recordTurnEndBySession on agent_stop', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'agent_stop', sessionId: 'sess-3' }));
    await vi.runAllTimersAsync();

    expect(mockRecordTurnEndBySession).toHaveBeenCalledOnce();
    expect(mockRecordTurnEndBySession).toHaveBeenCalledWith('sess-3');
  });

  it('calls recordTurnEndBySession on session_end', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'session_end', sessionId: 'sess-4' }));
    await vi.runAllTimersAsync();

    expect(mockRecordTurnEndBySession).toHaveBeenCalledOnce();
    expect(mockRecordTurnEndBySession).toHaveBeenCalledWith('sess-4');
  });

  it('does not call observeToolCallBySession on turn end events', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'agent_end' }));
    await vi.runAllTimersAsync();

    expect(mockObserveToolCallBySession).not.toHaveBeenCalled();
  });
});

describe('tapContextOutcomeObserver — ignored event types', () => {
  it('does not call either function for pre_tool_use', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'pre_tool_use', toolName: 'Read' }));
    await vi.runAllTimersAsync();

    expect(mockObserveToolCallBySession).not.toHaveBeenCalled();
    expect(mockRecordTurnEndBySession).not.toHaveBeenCalled();
  });

  it('does not call either function for session_start', async () => {
    tapContextOutcomeObserver(makePayload({ type: 'session_start' }));
    await vi.runAllTimersAsync();

    expect(mockObserveToolCallBySession).not.toHaveBeenCalled();
    expect(mockRecordTurnEndBySession).not.toHaveBeenCalled();
  });
});

describe('tapContextOutcomeObserver — error resilience', () => {
  it('logs a warning and does not throw when observeToolCallBySession throws', async () => {
    mockObserveToolCallBySession.mockImplementationOnce(() => {
      throw new Error('observer error');
    });

    const payload = makePayload({ type: 'post_tool_use', toolName: 'Read', input: { path: 'x.ts' } });
    expect(() => tapContextOutcomeObserver(payload)).not.toThrow();
    await vi.runAllTimersAsync(); // setImmediate fires

    // The warn was called inside the setImmediate callback
    const log = (await import('./logger')).default;
    expect(log.warn).toHaveBeenCalled();
  });
});
