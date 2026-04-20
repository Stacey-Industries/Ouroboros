/**
 * @vitest-environment jsdom
 *
 * useRafBatchedChunks.test.ts — verifies rAF-based batching behaviour.
 *
 * Tests use makeBatcher() directly (the pure factory) to avoid renderHook
 * overhead.  jsdom provides requestAnimationFrame as setTimeout(fn, 0);
 * vi.useFakeTimers() makes it controllable so we can assert the
 * "0 calls before tick, 1 call after tick" invariant deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatStreamChunk } from '../../types/electron-agent-chat';
import { makeBatcher } from './useRafBatchedChunks';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChunk(overrides: Partial<AgentChatStreamChunk> = {}): AgentChatStreamChunk {
  return {
    type: 'text_delta',
    messageId: 'msg-1',
    threadId: 'thread-1',
    textDelta: 'hello',
    ...overrides,
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRafBatchedChunks', () => {
  it('does not call onFlush before the rAF tick fires', () => {
    const onFlush = vi.fn();
    const { enqueue } = makeBatcher(onFlush);

    for (let i = 0; i < 5; i++) enqueue(makeChunk({ textDelta: `chunk-${i}` }));

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('calls onFlush exactly once after the rAF tick for 5 chunks', () => {
    const onFlush = vi.fn();
    const { enqueue } = makeBatcher(onFlush);

    for (let i = 0; i < 5; i++) enqueue(makeChunk({ textDelta: `chunk-${i}` }));

    vi.advanceTimersByTime(20);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0]).toHaveLength(5);
  });

  it('calls onFlush exactly once for 50 rapid chunks (the key perf assertion)', () => {
    const onFlush = vi.fn();
    const { enqueue } = makeBatcher(onFlush);

    for (let i = 0; i < 50; i++) enqueue(makeChunk({ textDelta: `chunk-${i}` }));

    vi.advanceTimersByTime(20);

    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('delivers chunks in insertion order', () => {
    const onFlush = vi.fn();
    const { enqueue } = makeBatcher(onFlush);

    enqueue(makeChunk({ textDelta: 'a' }));
    enqueue(makeChunk({ textDelta: 'b' }));
    enqueue(makeChunk({ textDelta: 'c' }));

    vi.advanceTimersByTime(20);

    const received = onFlush.mock.calls[0][0] as AgentChatStreamChunk[];
    expect(received.map((c) => c.textDelta)).toEqual(['a', 'b', 'c']);
  });

  it('flushNow drains synchronously without waiting for rAF', () => {
    const onFlush = vi.fn();
    const { enqueue, flushNow } = makeBatcher(onFlush);

    enqueue(makeChunk({ textDelta: 'x' }));
    enqueue(makeChunk({ textDelta: 'y' }));

    expect(onFlush).not.toHaveBeenCalled();
    flushNow();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0]).toHaveLength(2);
  });

  it('flushNow cancels the pending rAF so it does not fire twice', () => {
    const onFlush = vi.fn();
    const { enqueue, flushNow } = makeBatcher(onFlush);

    enqueue(makeChunk({ textDelta: 'z' }));
    flushNow();

    vi.advanceTimersByTime(20);

    // Still only 1 call — the rAF was cancelled
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('cleanup cancels pending rAF without calling onFlush', () => {
    const onFlush = vi.fn();
    const { enqueue, cleanup } = makeBatcher(onFlush);

    enqueue(makeChunk());
    cleanup();

    vi.advanceTimersByTime(20);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('accepts new chunks after cleanup and batches them correctly', () => {
    const onFlush = vi.fn();
    const { enqueue, cleanup } = makeBatcher(onFlush);

    enqueue(makeChunk({ textDelta: 'before' }));
    cleanup();

    enqueue(makeChunk({ textDelta: 'after' }));
    vi.advanceTimersByTime(20);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0][0].textDelta).toBe('after');
  });

  it('does not call onFlush when flushNow is called with an empty buffer', () => {
    const onFlush = vi.fn();
    const { flushNow } = makeBatcher(onFlush);

    flushNow();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('schedules a new rAF after the first tick drains the buffer', () => {
    const onFlush = vi.fn();
    const { enqueue } = makeBatcher(onFlush);

    enqueue(makeChunk({ textDelta: 'first-batch' }));
    vi.advanceTimersByTime(20);
    expect(onFlush).toHaveBeenCalledTimes(1);

    // Enqueue again — should schedule a new rAF
    enqueue(makeChunk({ textDelta: 'second-batch' }));
    vi.advanceTimersByTime(20);
    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  it('does not call onFlush when cleanup is called with an empty buffer', () => {
    const onFlush = vi.fn();
    const { cleanup } = makeBatcher(onFlush);

    cleanup();

    vi.advanceTimersByTime(20);

    expect(onFlush).not.toHaveBeenCalled();
  });
});
