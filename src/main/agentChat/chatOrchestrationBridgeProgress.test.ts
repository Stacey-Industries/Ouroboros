/**
 * chatOrchestrationBridgeProgress.test.ts — Smoke tests for the main progress
 * event dispatcher (handleProviderProgress).
 */

import { describe, expect, it, vi } from 'vitest';

import { handleProviderProgress } from './chatOrchestrationBridgeProgress';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('./chatOrchestrationBridgeMonitor', () => ({
  emitStreamChunk: vi.fn(),
  emitMonitorSessionEnd: vi.fn(),
  ensureMonitorSessionStarted: vi.fn(),
  stopIncrementalFlush: vi.fn(),
  startIncrementalFlush: vi.fn(),
}));

vi.mock('./chatOrchestrationBridgePersist', () => ({
  persistCompletedTurn: vi.fn(() => Promise.resolve()),
  persistCancelledTurn: vi.fn(() => Promise.resolve()),
  persistFailedTurnNoContent: vi.fn(() => Promise.resolve()),
  persistFailedTurnWithContent: vi.fn(() => Promise.resolve()),
}));

vi.mock('./chatOrchestrationBridgeProgressHelpers', () => ({
  findContextForProgress: vi.fn((activeSends, progress) => {
    return activeSends.get(progress.__taskId ?? 'task-1') ?? null;
  }),
  logFirstChunk: vi.fn(),
  emitToolActivityChunk: vi.fn(),
}));

vi.mock('./chatOrchestrationBridgeProgressBlocks', () => ({
  handleContentBlock: vi.fn(),
}));

vi.mock('./tokenCalibration', () => ({
  tokenCalibrationStore: { recordObservation: vi.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ActiveStreamContext> = {}): ActiveStreamContext {
  return {
    threadId: 'thread-1',
    assistantMessageId: 'msg-1',
    taskId: 'task-1',
    sessionId: 'sess-1',
    link: {},
    accumulatedText: '',
    firstChunkEmitted: false,
    model: 'sonnet',
    bufferedChunks: [],
    toolsUsed: [],
    accumulatedBlocks: [],
    monitorStartEmitted: false,
    streamEnded: false,
    ...overrides,
  } as ActiveStreamContext;
}

function makeRuntime(ctx: ActiveStreamContext): AgentChatBridgeRuntime {
  const activeSends = new Map<string, ActiveStreamContext>([['task-1', ctx]]);
  return {
    activeSends,
    streamChunkListeners: new Set(),
    pendingCancels: new Set(),
    now: () => Date.now(),
    threadStore: {
      updateThread: vi.fn(() => Promise.resolve({})),
    },
  } as unknown as AgentChatBridgeRuntime;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleProviderProgress', () => {
  it('is a no-op when ctx is not found', () => {
    const runtime = makeRuntime(makeCtx());
    runtime.activeSends.clear();
    // Should not throw
    expect(() =>
      handleProviderProgress(runtime, { status: 'streaming', __taskId: 'missing' } as never),
    ).not.toThrow();
  });

  it('skips processing when streamEnded=true and status is not cancelled', () => {
    const ctx = makeCtx({ streamEnded: true });
    const runtime = makeRuntime(ctx);
    // Should return early without calling any persist helpers
    expect(() =>
      handleProviderProgress(runtime, { status: 'streaming' } as never),
    ).not.toThrow();
  });

  it('syncs claudeSessionId from claude-code provider event', async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime(ctx);

    handleProviderProgress(runtime, {
      status: 'streaming',
      session: { sessionId: 'claude-sess-1', provider: 'claude-code' },
    } as never);

    expect(ctx.link.claudeSessionId).toBe('claude-sess-1');
  });

  it('syncs codexThreadId from codex provider event', () => {
    const ctx = makeCtx();
    const runtime = makeRuntime(ctx);

    handleProviderProgress(runtime, {
      status: 'streaming',
      session: { sessionId: 'codex-thread-1', provider: 'codex' },
    } as never);

    expect(ctx.link.codexThreadId).toBe('codex-thread-1');
  });

  it('updates tokenUsage on streaming event', () => {
    const ctx = makeCtx();
    const runtime = makeRuntime(ctx);
    const tokenUsage = { inputTokens: 10, outputTokens: 5 };

    handleProviderProgress(runtime, {
      status: 'streaming',
      tokenUsage,
    } as never);

    expect(ctx.tokenUsage).toEqual(tokenUsage);
  });

  it('handles legacy message on streaming event (no contentBlock)', () => {
    const ctx = makeCtx();
    const runtime = makeRuntime(ctx);

    handleProviderProgress(runtime, {
      status: 'streaming',
      message: 'hello world',
    } as never);

    expect(ctx.accumulatedText).toBe('hello world');
    expect(ctx.firstChunkEmitted).toBe(true);
  });

  it('calls persistCompletedTurn on completed status', async () => {
    const { persistCompletedTurn } = await import('./chatOrchestrationBridgePersist');
    const ctx = makeCtx();
    const runtime = makeRuntime(ctx);

    handleProviderProgress(runtime, { status: 'completed' } as never);

    expect(persistCompletedTurn).toHaveBeenCalledWith(ctx, runtime, expect.anything());
  });

  it('calls persistFailedTurnNoContent on failed status with no content', async () => {
    const { persistFailedTurnNoContent } = await import('./chatOrchestrationBridgePersist');
    const ctx = makeCtx({ accumulatedText: '', accumulatedBlocks: [] });
    const runtime = makeRuntime(ctx);

    handleProviderProgress(runtime, { status: 'failed', message: 'boom' } as never);

    expect(persistFailedTurnNoContent).toHaveBeenCalled();
  });

  it('calls persistFailedTurnWithContent on failed status when content exists', async () => {
    const { persistFailedTurnWithContent } = await import('./chatOrchestrationBridgePersist');
    const ctx = makeCtx({ accumulatedText: 'partial response' });
    const runtime = makeRuntime(ctx);

    handleProviderProgress(runtime, { status: 'failed', message: 'boom' } as never);

    expect(persistFailedTurnWithContent).toHaveBeenCalled();
  });
});
