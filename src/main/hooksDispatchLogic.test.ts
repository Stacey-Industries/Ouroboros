/**
 * hooksDispatchLogic.test.ts — Zero-mock unit tests for pure dispatch logic.
 *
 * These functions have no Electron dependencies and test with real state.
 */

import { describe, expect, it } from 'vitest';

import type { HookPayload } from './hooks';
import {
  drainQueue,
  evictOrphanedSessions,
  inferSessionId,
  queuePayload,
  trackSessionLifecycle,
  truncateField,
  truncatePayloadForDispatch,
} from './hooksDispatchLogic';

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'sess-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── truncateField ─────────────────────────────────────────────────────

describe('truncateField', () => {
  it('returns null/undefined unchanged', () => {
    expect(truncateField(null)).toBeNull();
    expect(truncateField(undefined)).toBeUndefined();
  });

  it('returns short strings unchanged', () => {
    expect(truncateField('hello')).toBe('hello');
  });

  it('truncates strings exceeding 10KB', () => {
    const long = 'x'.repeat(20_000);
    const result = truncateField(long) as string;
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain('…[truncated]');
  });

  it('truncates objects via JSON.stringify', () => {
    const big = { data: 'y'.repeat(20_000) };
    const result = truncateField(big) as string;
    expect(typeof result).toBe('string');
    expect(result).toContain('…[truncated]');
  });
});

// ── truncatePayloadForDispatch ────────────────────────────────────────

describe('truncatePayloadForDispatch', () => {
  it('returns same reference when no input/output', () => {
    const p = makePayload();
    expect(truncatePayloadForDispatch(p)).toBe(p);
  });

  it('truncates large input field', () => {
    const p = makePayload({ input: 'z'.repeat(20_000) });
    const result = truncatePayloadForDispatch(p);
    expect(result).not.toBe(p);
    expect((result.input as string).length).toBeLessThan(20_000);
  });

  it('truncates large output field', () => {
    const p = makePayload({ output: 'z'.repeat(20_000) });
    const result = truncatePayloadForDispatch(p);
    expect((result.output as string).length).toBeLessThan(20_000);
  });

  it('preserves small input/output unchanged', () => {
    const p = makePayload({ input: 'small', output: 'tiny' });
    const result = truncatePayloadForDispatch(p);
    expect(result.input).toBe('small');
    expect(result.output).toBe('tiny');
  });
});

// ── trackSessionLifecycle ─────────────────────────────────────────────

describe('trackSessionLifecycle', () => {
  it('tracks session_start', () => {
    const sessions = new Map<string, number>();
    const cwds = new Map<string, string>();
    trackSessionLifecycle(
      sessions,
      cwds,
      makePayload({
        type: 'session_start',
        sessionId: 's1',
        timestamp: 100,
        cwd: '/proj',
      }),
    );
    expect(sessions.get('s1')).toBe(100);
    expect(cwds.get('s1')).toBe('/proj');
  });

  it('tracks agent_start', () => {
    const sessions = new Map<string, number>();
    const cwds = new Map<string, string>();
    trackSessionLifecycle(
      sessions,
      cwds,
      makePayload({
        type: 'agent_start',
        sessionId: 's2',
        timestamp: 200,
      }),
    );
    expect(sessions.has('s2')).toBe(true);
  });

  it('removes session on session_stop', () => {
    const sessions = new Map([['s1', 100]]);
    const cwds = new Map([['s1', '/proj']]);
    trackSessionLifecycle(
      sessions,
      cwds,
      makePayload({
        type: 'session_stop',
        sessionId: 's1',
        timestamp: 200,
      }),
    );
    expect(sessions.has('s1')).toBe(false);
  });

  it('removes session on agent_end', () => {
    const sessions = new Map([['s1', 100]]);
    const cwds = new Map<string, string>();
    trackSessionLifecycle(
      sessions,
      cwds,
      makePayload({
        type: 'agent_end',
        sessionId: 's1',
        timestamp: 200,
      }),
    );
    expect(sessions.has('s1')).toBe(false);
  });

  it('updates timestamp for known session on tool event', () => {
    const sessions = new Map([['s1', 100]]);
    const cwds = new Map<string, string>();
    trackSessionLifecycle(
      sessions,
      cwds,
      makePayload({
        type: 'pre_tool_use',
        sessionId: 's1',
        timestamp: 500,
      }),
    );
    expect(sessions.get('s1')).toBe(500);
  });

  it('ignores unknown session on tool event', () => {
    const sessions = new Map<string, number>();
    const cwds = new Map<string, string>();
    trackSessionLifecycle(
      sessions,
      cwds,
      makePayload({
        type: 'pre_tool_use',
        sessionId: 'unknown',
        timestamp: 500,
      }),
    );
    expect(sessions.size).toBe(0);
  });

  it('does not overwrite existing cwd on tool event', () => {
    const sessions = new Map([['s1', 100]]);
    const cwds = new Map([['s1', '/original']]);
    trackSessionLifecycle(
      sessions,
      cwds,
      makePayload({
        type: 'pre_tool_use',
        sessionId: 's1',
        timestamp: 200,
        cwd: '/new',
      }),
    );
    expect(cwds.get('s1')).toBe('/original');
  });
});

// ── inferSessionId ────────────────────────────────────────────────────

describe('inferSessionId', () => {
  it('returns payload unchanged for non-tool events', () => {
    const sessions = new Map([['s1', 100]]);
    const p = makePayload({ type: 'session_start', sessionId: 'unknown' });
    expect(inferSessionId(sessions, p)).toBe(p);
  });

  it('returns payload unchanged when session is tracked', () => {
    const sessions = new Map([['s1', 100]]);
    const p = makePayload({ type: 'pre_tool_use', sessionId: 's1' });
    expect(inferSessionId(sessions, p)).toBe(p);
  });

  it('infers most recent session for unknown tool event', () => {
    const sessions = new Map([
      ['s1', 100],
      ['s2', 200],
    ]);
    const p = makePayload({ type: 'pre_tool_use', sessionId: 'unknown' });
    const result = inferSessionId(sessions, p);
    expect(result.sessionId).toBe('s2');
  });

  it('infers most recent session for untracked tool event', () => {
    const sessions = new Map([['s1', 300]]);
    const p = makePayload({
      type: 'post_tool_use',
      sessionId: 'not-tracked',
    });
    const result = inferSessionId(sessions, p);
    expect(result.sessionId).toBe('s1');
  });

  it('returns original when no sessions active', () => {
    const sessions = new Map<string, number>();
    const p = makePayload({ type: 'pre_tool_use', sessionId: 'unknown' });
    const result = inferSessionId(sessions, p);
    expect(result.sessionId).toBe('unknown');
  });
});

// ── evictOrphanedSessions ─────────────────────────────────────────────

describe('evictOrphanedSessions', () => {
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  it('evicts sessions older than 2 hours', () => {
    const now = 10_000_000;
    const sessions = new Map([
      ['old', now - TWO_HOURS - 1],
      ['fresh', now - 1000],
    ]);
    const cwds = new Map([
      ['old', '/old'],
      ['fresh', '/fresh'],
    ]);
    const evicted = evictOrphanedSessions(sessions, cwds, now);
    expect(evicted).toEqual(['old']);
    expect(sessions.has('old')).toBe(false);
    expect(cwds.has('old')).toBe(false);
    expect(sessions.has('fresh')).toBe(true);
  });

  it('returns empty when nothing to evict', () => {
    const now = 10_000_000;
    const sessions = new Map([['s1', now - 1000]]);
    const cwds = new Map<string, string>();
    expect(evictOrphanedSessions(sessions, cwds, now)).toEqual([]);
  });
});

// ── queuePayload / drainQueue ─────────────────────────────────────────

describe('queuePayload', () => {
  it('adds payload to queue', () => {
    const queue: HookPayload[] = [];
    const p = makePayload();
    expect(queuePayload(queue, p)).toBe(true);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toBe(p);
  });

  it('rejects when queue is full (500)', () => {
    const queue = Array.from({ length: 500 }, () => makePayload());
    expect(queuePayload(queue, makePayload())).toBe(false);
    expect(queue).toHaveLength(500);
  });
});

describe('drainQueue', () => {
  it('returns all items and empties queue', () => {
    const p1 = makePayload({ sessionId: 'a' });
    const p2 = makePayload({ sessionId: 'b' });
    const queue = [p1, p2];
    const drained = drainQueue(queue);
    expect(drained).toEqual([p1, p2]);
    expect(queue).toHaveLength(0);
  });

  it('returns empty array for empty queue', () => {
    expect(drainQueue([])).toEqual([]);
  });
});
