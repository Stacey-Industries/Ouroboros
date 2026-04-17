/**
 * factClaimTap.test.ts — Smoke tests for the fact-claim stream tap shim.
 *
 * Verifies that tapTextDeltaForFactClaims correctly delegates to
 * maybePauseForFactClaim with the right arguments derived from the
 * active stream context, and that emitStreamChunk is called when the
 * orchestrator fires a status chunk.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../research/factClaimPauseOrchestrator', () => ({
  maybePauseForFactClaim: vi.fn(),
}));

vi.mock('./chatOrchestrationBridgeMonitor', () => ({
  emitStreamChunk: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { maybePauseForFactClaim } from '../research/factClaimPauseOrchestrator';
import { emitStreamChunk } from './chatOrchestrationBridgeMonitor';
import { tapTextDeltaForFactClaims } from './factClaimTap';
import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ActiveStreamContext> = {}): ActiveStreamContext {
  return {
    threadId: 'thread-1',
    assistantMessageId: 'msg-1',
    taskId: 'task-1',
    sessionId: 'session-1',
    link: {} as never,
    accumulatedText: '',
    firstChunkEmitted: false,
    bufferedChunks: [],
    toolsUsed: [],
    accumulatedBlocks: [],
    monitorStartEmitted: false,
    streamEnded: false,
    model: 'claude-sonnet-4-6',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tapTextDeltaForFactClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maybePauseForFactClaim).mockResolvedValue(undefined);
  });

  it('calls maybePauseForFactClaim with sessionId, modelId, chunk, and maxLatencyMs 800', async () => {
    const ctx = makeCtx();
    const listeners = new Set<(chunk: unknown) => void>();

    await tapTextDeltaForFactClaims(ctx, listeners as never, 'z.string()', 1000);

    expect(maybePauseForFactClaim).toHaveBeenCalledOnce();
    expect(maybePauseForFactClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        modelId: 'claude-sonnet-4-6',
        chunk: 'z.string()',
        maxLatencyMs: 800,
      }),
    );
  });

  it('passes an emitStatusChunk callback that calls emitStreamChunk', async () => {
    const ctx = makeCtx();
    const listeners = new Set<(chunk: unknown) => void>();

    // Capture the emitStatusChunk callback and invoke it
    vi.mocked(maybePauseForFactClaim).mockImplementation(async (input) => {
      input.emitStatusChunk('_checking zod…_');
    });

    await tapTextDeltaForFactClaims(ctx, listeners as never, 'z.string()', 1234);

    expect(emitStreamChunk).toHaveBeenCalledWith(
      listeners,
      expect.objectContaining({
        threadId: 'thread-1',
        messageId: 'msg-1',
        type: 'text_delta',
        textDelta: '_checking zod…_',
        timestamp: 1234,
      }),
      ctx,
    );
  });

  it('propagates rejection from maybePauseForFactClaim (orchestrator is the never-throw boundary)', async () => {
    const ctx = makeCtx();
    const listeners = new Set<(chunk: unknown) => void>();

    // maybePauseForFactClaim never rejects in production — it swallows internally.
    // The tap does not add a redundant try/catch; the orchestrator owns that contract.
    vi.mocked(maybePauseForFactClaim).mockRejectedValue(new Error('unexpected'));

    await expect(
      tapTextDeltaForFactClaims(ctx, listeners as never, 'z.string()', 1000),
    ).rejects.toThrow('unexpected');
  });

  it('uses ctx.model as modelId', async () => {
    const ctx = makeCtx({ model: 'claude-opus-4-6' });
    const listeners = new Set<(chunk: unknown) => void>();

    await tapTextDeltaForFactClaims(ctx, listeners as never, 'prisma.user.findMany', 500);

    expect(maybePauseForFactClaim).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'claude-opus-4-6' }),
    );
  });

  it('passes undefined modelId when ctx.model is absent', async () => {
    const ctx = makeCtx({ model: undefined });
    const listeners = new Set<(chunk: unknown) => void>();

    await tapTextDeltaForFactClaims(ctx, listeners as never, 'z.string()', 500);

    expect(maybePauseForFactClaim).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: undefined }),
    );
  });
});
