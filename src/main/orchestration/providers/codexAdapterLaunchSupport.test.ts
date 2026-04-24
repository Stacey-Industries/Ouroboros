/**
 * Smoke tests for codexAdapterLaunchSupport.
 *
 * Covers the pure event-emission helpers: transport warning injection,
 * launch-success / launch-error routing, and cancellation handling.
 * Scheduler functions themselves are integration-tested via codexAdapter.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('./codexAdapterHelpers', () => ({
  buildFailureMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  cleanupTempFiles: vi.fn(() => Promise.resolve()),
  materializeAttachments: vi.fn(),
  resolveCodexSettings: vi.fn(),
  shouldRetryCodexWithoutResume: vi.fn(() => false),
}));
vi.mock('./codexAppServerRunner', () => ({ runCodexAppServerTurn: vi.fn() }));
vi.mock('./codexContextBuilder', () => ({ buildPrompt: vi.fn(() => 'prompt') }));
vi.mock('./codexLaunch', () => ({ spawnCodexProcess: vi.fn() }));
vi.mock('./codexThreadDiag', () => ({ verifyCodexThreadId: vi.fn() }));

import {
  activeHandles,
  cancelledTasks,
  emitTransportWarning,
  handleLaunchError,
  handleLaunchSuccess,
} from './codexAdapterLaunchSupport';

interface FakeSessionRef {
  sessionId: string | null;
}

function makeSink(): { emit: ReturnType<typeof vi.fn> } {
  return { emit: vi.fn() };
}

function makeCompletionArgs(overrides: Partial<Record<string, unknown>> = {}) {
  const sink = makeSink();
  const sessionRef: FakeSessionRef = { sessionId: null };
  return {
    sink,
    sessionRef,
    args: {
      taskId: 'task-1',
      invocationTempPaths: [],
      sink,
      sessionRef,
      getUsage: vi.fn(() => ({ inputTokens: 1, outputTokens: 2 })),
      getNextBlockIndex: vi.fn(() => 3),
      ...overrides,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe('emitTransportWarning', () => {
  it('is a no-op when warning is undefined', () => {
    const sink = makeSink();
    emitTransportWarning(sink as never, { sessionId: null } as never, undefined);
    expect(sink.emit).not.toHaveBeenCalled();
  });

  it('emits a streaming event with the warning text when present', () => {
    const sink = makeSink();
    emitTransportWarning(sink as never, { sessionId: null } as never, 'fallback used');

    expect(sink.emit).toHaveBeenCalledTimes(1);
    const event = sink.emit.mock.calls[0][0];
    expect(event.status).toBe('streaming');
    expect(event.message).toBe('fallback used');
    expect(event.contentBlock.textDelta).toContain('fallback used');
  });
});

describe('handleLaunchSuccess', () => {
  beforeEach(() => {
    activeHandles.clear();
    cancelledTasks.clear();
  });

  it('emits a cancelled event when result is null', () => {
    const { sink, args } = makeCompletionArgs();
    handleLaunchSuccess(null, args);

    const emitted = sink.emit.mock.calls[0][0];
    expect(emitted.status).toBe('cancelled');
  });

  it('emits a completed event with token usage when result has a threadId', () => {
    const { sink, args, sessionRef } = makeCompletionArgs();
    handleLaunchSuccess({ durationMs: 42, threadId: 'thread-xyz' }, args);

    expect(sessionRef.sessionId).toBe('thread-xyz');
    const emitted = sink.emit.mock.calls[0][0];
    expect(emitted.status).toBe('completed');
    expect(emitted.durationMs).toBe(42);
    expect(emitted.tokenUsage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });

  it('removes the active handle entry on success', () => {
    activeHandles.set('task-1', { kill: () => undefined, threadId: null });
    const { args } = makeCompletionArgs();
    handleLaunchSuccess({ durationMs: 1, threadId: null }, args);

    expect(activeHandles.has('task-1')).toBe(false);
  });
});

describe('handleLaunchError', () => {
  beforeEach(() => {
    activeHandles.clear();
    cancelledTasks.clear();
  });

  it('emits a cancelled event (without failure) when task was cancelled', () => {
    cancelledTasks.add('task-1');
    const { sink, args } = makeCompletionArgs();
    handleLaunchError(new Error('kill'), args);

    expect(sink.emit).toHaveBeenCalledTimes(1);
    expect(sink.emit.mock.calls[0][0].status).toBe('cancelled');
    expect(cancelledTasks.has('task-1')).toBe(false);
  });

  it('emits streaming + failed events on a non-cancelled error', () => {
    const { sink, args } = makeCompletionArgs();
    handleLaunchError(new Error('boom'), args);

    expect(sink.emit).toHaveBeenCalledTimes(2);
    expect(sink.emit.mock.calls[0][0].status).toBe('streaming');
    expect(sink.emit.mock.calls[1][0].status).toBe('failed');
    expect(sink.emit.mock.calls[1][0].message).toBe('boom');
  });
});
