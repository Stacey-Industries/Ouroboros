/**
 * threadCostRollup.test.ts — Unit tests for per-thread and global cost rollup.
 */

import { describe, expect, it } from 'vitest';

import type { AgentChatMessageRecord } from './types';
import {
  computeGlobalCostRollup,
  computeThreadCostRollup,
  rollupFromThread,
  type ThreadCostRollup,
} from './threadCostRollup';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMessage(
  overrides: Partial<AgentChatMessageRecord> = {},
): AgentChatMessageRecord {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ─── computeThreadCostRollup ──────────────────────────────────────────────────

describe('computeThreadCostRollup', () => {
  it('returns zero rollup for empty messages array', () => {
    const result = computeThreadCostRollup('t1', []);
    expect(result.threadId).toBe('t1');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.totalUsd).toBe(0);
  });

  it('skips messages without tokenUsage', () => {
    const messages = [makeMessage({ tokenUsage: undefined })];
    const result = computeThreadCostRollup('t1', messages);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.totalUsd).toBe(0);
  });

  it('aggregates token counts from multiple messages', () => {
    const messages = [
      makeMessage({ tokenUsage: { inputTokens: 1000, outputTokens: 500 } }),
      makeMessage({ tokenUsage: { inputTokens: 2000, outputTokens: 1000 } }),
    ];
    const result = computeThreadCostRollup('t1', messages);
    expect(result.inputTokens).toBe(3000);
    expect(result.outputTokens).toBe(1500);
  });

  it('computes non-zero cost for real token values using default pricing', () => {
    const messages = [
      makeMessage({ tokenUsage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } }),
    ];
    const result = computeThreadCostRollup('t1', messages);
    // Default (Sonnet 4.6): $3/M input + $15/M output = $18 total
    expect(result.totalUsd).toBeCloseTo(18, 5);
  });

  it('uses model-specific pricing when model is present', () => {
    const messages = [
      makeMessage({
        model: 'claude-haiku-4-5',
        tokenUsage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      }),
    ];
    const result = computeThreadCostRollup('t1', messages);
    // Haiku 4.5: $1/M input + $5/M output = $6 total
    expect(result.totalUsd).toBeCloseTo(6, 5);
  });

  it('preserves the provided threadId', () => {
    const result = computeThreadCostRollup('my-thread-id', []);
    expect(result.threadId).toBe('my-thread-id');
  });
});

// ─── computeGlobalCostRollup ──────────────────────────────────────────────────

describe('computeGlobalCostRollup', () => {
  it('returns zeros for empty thread list', () => {
    const result = computeGlobalCostRollup([]);
    expect(result.totalUsd).toBe(0);
    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.threadCount).toBe(0);
  });

  it('sums across all threads', () => {
    const threads: ThreadCostRollup[] = [
      { threadId: 't1', inputTokens: 100, outputTokens: 50, totalUsd: 1.0 },
      { threadId: 't2', inputTokens: 200, outputTokens: 100, totalUsd: 2.5 },
    ];
    const result = computeGlobalCostRollup(threads);
    expect(result.totalInputTokens).toBe(300);
    expect(result.totalOutputTokens).toBe(150);
    expect(result.totalUsd).toBeCloseTo(3.5, 10);
    expect(result.threadCount).toBe(2);
  });
});

// ─── rollupFromThread ─────────────────────────────────────────────────────────

describe('rollupFromThread', () => {
  it('extracts threadId from thread record', () => {
    const thread = {
      version: 1 as const,
      id: 'thread-abc',
      workspaceRoot: '/proj',
      createdAt: 0,
      updatedAt: 0,
      title: 'test',
      status: 'idle' as const,
      messages: [],
    };
    const result = rollupFromThread(thread);
    expect(result.threadId).toBe('thread-abc');
    expect(result.totalUsd).toBe(0);
  });
});
