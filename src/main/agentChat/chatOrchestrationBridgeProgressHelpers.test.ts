/**
 * chatOrchestrationBridgeProgressHelpers.test.ts — Smoke tests for the two
 * pure helpers extracted from chatOrchestrationBridgeProgress.ts.
 */

import { describe, expect, it } from 'vitest';

import { findContextForProgress, logFirstChunk } from './chatOrchestrationBridgeProgressHelpers';
import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';

// ─── logFirstChunk ────────────────────────────────────────────────────────────

describe('logFirstChunk', () => {
  it('sets firstChunkLogged to true on first call', () => {
    const ctx = { firstChunkLogged: false } as unknown as ActiveStreamContext;
    logFirstChunk(ctx);
    expect(ctx.firstChunkLogged).toBe(true);
  });

  it('does not mutate ctx when already logged', () => {
    const ctx = { firstChunkLogged: true, sendStartedAt: 12345 } as unknown as ActiveStreamContext;
    logFirstChunk(ctx);
    // No error thrown; state unchanged
    expect(ctx.firstChunkLogged).toBe(true);
  });

  it('does not throw when sendStartedAt is undefined', () => {
    const ctx = { firstChunkLogged: false, sendStartedAt: undefined } as unknown as ActiveStreamContext;
    expect(() => logFirstChunk(ctx)).not.toThrow();
  });
});

// ─── findContextForProgress ───────────────────────────────────────────────────

describe('findContextForProgress', () => {
  const makeCtx = (sessionId: string, taskId: string): ActiveStreamContext =>
    ({ sessionId, taskId }) as unknown as ActiveStreamContext;

  it('returns entry when sessionId matches', () => {
    const ctx = makeCtx('sess-1', 'task-1');
    const activeSends = new Map([['task-1', ctx]]);
    const progress = { session: { sessionId: 'sess-1' } } as Parameters<typeof findContextForProgress>[1];
    expect(findContextForProgress(activeSends, progress)).toBe(ctx);
  });

  it('returns entry when externalTaskId matches', () => {
    const ctx = makeCtx('sess-1', 'task-1');
    const activeSends = new Map([['task-1', ctx]]);
    const progress = { session: { externalTaskId: 'task-1' } } as Parameters<typeof findContextForProgress>[1];
    expect(findContextForProgress(activeSends, progress)).toBe(ctx);
  });

  it('returns entry when requestId includes taskId', () => {
    const ctx = makeCtx('sess-1', 'task-1');
    const activeSends = new Map([['task-1', ctx]]);
    const progress = { session: { requestId: 'prefix:task-1:suffix' } } as Parameters<typeof findContextForProgress>[1];
    expect(findContextForProgress(activeSends, progress)).toBe(ctx);
  });

  it('returns undefined when no match', () => {
    const ctx = makeCtx('sess-1', 'task-1');
    const activeSends = new Map([['task-1', ctx]]);
    const progress = { session: { sessionId: 'no-match' } } as Parameters<typeof findContextForProgress>[1];
    expect(findContextForProgress(activeSends, progress)).toBeUndefined();
  });

  it('returns undefined for empty activeSends', () => {
    const activeSends = new Map<string, ActiveStreamContext>();
    const progress = { session: { sessionId: 'any' } } as Parameters<typeof findContextForProgress>[1];
    expect(findContextForProgress(activeSends, progress)).toBeUndefined();
  });
});
