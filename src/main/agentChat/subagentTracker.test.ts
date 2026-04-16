/**
 * subagentTracker.test.ts — Unit tests for the subagent lifecycle tracker.
 *
 * Tests cover:
 *   - Normal lifecycle: recordStart → recordMessage/recordUsage → recordEnd
 *   - Idempotent re-start
 *   - Out-of-order delivery (message/usage before start, end before start)
 *   - Cost calculation
 *   - listForParent / countLive / rollupCostForParent queries
 *   - onTaskToolPreUse fast path (childSessionId in tool input)
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { HookPayload } from '../hooks';
import {
  _clearAll,
  countLive,
  get,
  listForParent,
  onTaskToolPreUse,
  recordEnd,
  recordMessage,
  recordStart,
  recordUsage,
  rollupCostForParent,
} from './subagentTracker';

beforeEach(() => {
  _clearAll();
});

// ─── Basic lifecycle ──────────────────────────────────────────────────────────

describe('recordStart', () => {
  it('creates a new running record', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    const rec = get('s1');
    expect(rec).toBeDefined();
    expect(rec?.status).toBe('running');
    expect(rec?.parentSessionId).toBe('p1');
    expect(rec?.inputTokens).toBe(0);
  });

  it('is idempotent — second call updates fields without losing tokens', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordUsage('s1', { input: 100, output: 50 });
    recordStart({ id: 's1', parentSessionId: 'p1', taskLabel: 'updated label' });
    const rec = get('s1');
    expect(rec?.taskLabel).toBe('updated label');
    expect(rec?.inputTokens).toBe(100);
  });

  it('accepts optional fields', () => {
    recordStart({
      id: 's2',
      parentSessionId: 'p2',
      parentThreadId: 'thread-1',
      toolCallId: 'tc-1',
      taskLabel: 'Run tests',
    });
    const rec = get('s2');
    expect(rec?.parentThreadId).toBe('thread-1');
    expect(rec?.toolCallId).toBe('tc-1');
    expect(rec?.taskLabel).toBe('Run tests');
  });
});

describe('recordEnd', () => {
  it('sets status and endedAt', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordEnd('s1', 'completed');
    const rec = get('s1');
    expect(rec?.status).toBe('completed');
    expect(rec?.endedAt).toBeGreaterThan(0);
  });

  it('accepts cancelled and failed statuses', () => {
    recordStart({ id: 's2', parentSessionId: 'p1' });
    recordEnd('s2', 'cancelled');
    expect(get('s2')?.status).toBe('cancelled');

    recordStart({ id: 's3', parentSessionId: 'p1' });
    recordEnd('s3', 'failed');
    expect(get('s3')?.status).toBe('failed');
  });
});

// ─── Token / cost accumulation ────────────────────────────────────────────────

describe('recordUsage', () => {
  it('accumulates token counts', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordUsage('s1', { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 });
    recordUsage('s1', { input: 500, output: 250 });
    const rec = get('s1');
    expect(rec?.inputTokens).toBe(1500);
    expect(rec?.outputTokens).toBe(750);
    expect(rec?.cacheReadTokens).toBe(200);
    expect(rec?.cacheWriteTokens).toBe(100);
  });

  it('uses explicit usdCost when provided', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordUsage('s1', { input: 0, output: 0, usd: 0.05 });
    expect(get('s1')?.usdCost).toBeCloseTo(0.05);
  });

  it('calculates cost from tokens when usd not provided', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    // Sonnet pricing: $3/1M input, $15/1M output
    recordUsage('s1', { input: 1_000_000, output: 1_000_000 });
    const rec = get('s1');
    expect(rec?.usdCost).toBeCloseTo(18, 1); // $3 + $15
  });
});

// ─── Message recording ────────────────────────────────────────────────────────

describe('recordMessage', () => {
  it('appends messages to the record', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordMessage('s1', { role: 'user', content: 'Hello', at: 1000 });
    recordMessage('s1', { role: 'assistant', content: 'Hi', at: 2000 });
    const rec = get('s1');
    expect(rec?.messages).toHaveLength(2);
    expect(rec?.messages[0].role).toBe('user');
    expect(rec?.messages[1].content).toBe('Hi');
  });
});

// ─── Out-of-order delivery ────────────────────────────────────────────────────

describe('out-of-order delivery', () => {
  it('buffers messages and usage that arrive before recordStart', () => {
    recordMessage('late-s1', { role: 'user', content: 'pre-start', at: 1000 });
    recordUsage('late-s1', { input: 500, output: 250 });
    expect(get('late-s1')).toBeUndefined();

    recordStart({ id: 'late-s1', parentSessionId: 'p1' });
    const rec = get('late-s1');
    expect(rec?.messages).toHaveLength(1);
    expect(rec?.messages[0].content).toBe('pre-start');
    expect(rec?.inputTokens).toBe(500);
    expect(rec?.outputTokens).toBe(250);
  });

  it('creates a stub when recordEnd arrives before recordStart', () => {
    recordEnd('orphan-1', 'failed');
    const rec = get('orphan-1');
    expect(rec).toBeDefined();
    expect(rec?.status).toBe('failed');
    expect(rec?.endedAt).toBeGreaterThan(0);
  });

  it('flushes pending buffer into the stub created by out-of-order end', () => {
    recordMessage('orphan-2', { role: 'assistant', content: 'early msg', at: 1000 });
    recordUsage('orphan-2', { input: 100, output: 50 });
    recordEnd('orphan-2', 'completed');
    const rec = get('orphan-2');
    expect(rec?.messages).toHaveLength(1);
    expect(rec?.inputTokens).toBe(100);
    expect(rec?.status).toBe('completed');
  });
});

// ─── Query helpers ────────────────────────────────────────────────────────────

describe('listForParent', () => {
  it('returns all records for a given parent', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordStart({ id: 's2', parentSessionId: 'p1' });
    recordStart({ id: 's3', parentSessionId: 'p2' });
    expect(listForParent('p1')).toHaveLength(2);
    expect(listForParent('p2')).toHaveLength(1);
    expect(listForParent('p99')).toHaveLength(0);
  });
});

describe('countLive', () => {
  it('counts only running records', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordStart({ id: 's2', parentSessionId: 'p1' });
    recordEnd('s2', 'completed');
    expect(countLive('p1')).toBe(1);
  });

  it('returns 0 when no children', () => {
    expect(countLive('p-empty')).toBe(0);
  });
});

describe('rollupCostForParent', () => {
  it('aggregates tokens and cost from all children', () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordUsage('s1', { input: 1000, output: 500, usd: 0.02 });
    recordStart({ id: 's2', parentSessionId: 'p1' });
    recordUsage('s2', { input: 2000, output: 1000, usd: 0.04 });

    const rollup = rollupCostForParent('p1');
    expect(rollup.inputTokens).toBe(3000);
    expect(rollup.outputTokens).toBe(1500);
    expect(rollup.usdCost).toBeCloseTo(0.06);
    expect(rollup.childCount).toBe(2);
  });

  it('returns zeros when no children', () => {
    const rollup = rollupCostForParent('p-none');
    expect(rollup.childCount).toBe(0);
    expect(rollup.usdCost).toBe(0);
  });
});

// ─── Hook pipeline integration ────────────────────────────────────────────────

describe('onTaskToolPreUse', () => {
  it('records start when childSessionId is present in task input', () => {
    const payload: Partial<HookPayload> = {
      type: 'pre_tool_use',
      sessionId: 'parent-session',
      toolCallId: 'tc-abc',
      toolName: 'Task',
      timestamp: Date.now(),
      input: {
        description: 'Run linting',
        childSessionId: 'child-session-1',
      },
    };
    onTaskToolPreUse(payload as HookPayload);
    const rec = get('child-session-1');
    expect(rec).toBeDefined();
    expect(rec?.parentSessionId).toBe('parent-session');
    expect(rec?.toolCallId).toBe('tc-abc');
    expect(rec?.taskLabel).toBe('Run linting');
  });

  it('does nothing when childSessionId is absent', () => {
    const payload: Partial<HookPayload> = {
      type: 'pre_tool_use',
      sessionId: 'parent-session',
      toolCallId: 'tc-xyz',
      toolName: 'Task',
      timestamp: Date.now(),
      input: { description: 'No child id' },
    };
    onTaskToolPreUse(payload as HookPayload);
    // No record should have been created
    expect(listForParent('parent-session')).toHaveLength(0);
  });
});

// ─── Hook tap lifecycle smoke test ───────────────────────────────────────────

describe('hook tap lifecycle', () => {
  it('transitions from running to completed via onTaskToolPreUse + recordEnd', () => {
    const prePayload: Partial<HookPayload> = {
      type: 'pre_tool_use',
      sessionId: 'parent-s1',
      toolCallId: 'tc-1',
      toolName: 'Task',
      timestamp: Date.now(),
      input: { description: 'Lint files', childSessionId: 'child-s1' },
    };
    onTaskToolPreUse(prePayload as HookPayload);
    const runningRec = get('child-s1');
    expect(runningRec?.status).toBe('running');

    recordEnd('child-s1', 'completed');
    expect(get('child-s1')?.status).toBe('completed');
    expect(get('child-s1')?.endedAt).toBeGreaterThan(0);
  });
});
