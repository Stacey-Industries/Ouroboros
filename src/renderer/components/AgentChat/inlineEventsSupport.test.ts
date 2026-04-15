/**
 * inlineEventsSupport.test.ts — Unit tests for inline event interleaving helpers.
 */

import { describe, expect, it } from 'vitest';

import type { AgentSession } from '../AgentMonitor/types';
import { buildInlineEvents, eventsInSlot } from './inlineEventsSupport';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(
  id: string,
  overrides: Partial<AgentSession> = {},
): AgentSession {
  return {
    id,
    taskLabel: 'test task',
    status: 'complete',
    startedAt: 1000,
    completedAt: 9000,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

function makeToolCall(id: string, timestamp: number, toolName = 'Read') {
  return { id, toolName, input: 'file.ts', timestamp, status: 'success' as const };
}

// ─── buildInlineEvents ────────────────────────────────────────────────────────

describe('buildInlineEvents — empty cases', () => {
  it('returns [] when inlineEventTypes is empty', () => {
    const session = makeSession('s1', { toolCalls: [makeToolCall('c1', 2000)] });
    expect(buildInlineEvents([session], [])).toEqual([]);
  });

  it('returns [] when agents list is empty', () => {
    expect(buildInlineEvents([], ['pre_tool_use'])).toEqual([]);
  });
});

describe('buildInlineEvents — session_start / session_end', () => {
  it('includes session_start event when type is in inlineEventTypes', () => {
    const session = makeSession('s1', { startedAt: 1000 });
    const events = buildInlineEvents([session], ['session_start']);
    const start = events.find((e) => e.type === 'session_start');
    expect(start).toBeDefined();
    expect(start?.timestamp).toBe(1000);
    expect(start?.id).toBe('s1:start');
  });

  it('includes session_end when completedAt is set', () => {
    const session = makeSession('s1', { completedAt: 9000 });
    const events = buildInlineEvents([session], ['session_end']);
    const end = events.find((e) => e.type === 'session_end');
    expect(end).toBeDefined();
    expect(end?.timestamp).toBe(9000);
  });

  it('omits session_end when completedAt is undefined', () => {
    const session = makeSession('s1', { completedAt: undefined });
    const events = buildInlineEvents([session], ['session_end']);
    expect(events.filter((e) => e.type === 'session_end')).toHaveLength(0);
  });

  it('omits session_start when not in inlineEventTypes', () => {
    const session = makeSession('s1');
    const events = buildInlineEvents([session], ['session_end']);
    expect(events.filter((e) => e.type === 'session_start')).toHaveLength(0);
  });
});

describe('buildInlineEvents — pre_tool_use from tool calls', () => {
  it('includes a pre_tool_use event per tool call when type is allowed', () => {
    const session = makeSession('s1', {
      toolCalls: [makeToolCall('c1', 2000), makeToolCall('c2', 3000)],
    });
    const events = buildInlineEvents([session], ['pre_tool_use']);
    expect(events.filter((e) => e.type === 'pre_tool_use')).toHaveLength(2);
  });

  it('omits tool call events when pre_tool_use not in inlineEventTypes', () => {
    const session = makeSession('s1', {
      toolCalls: [makeToolCall('c1', 2000)],
    });
    const events = buildInlineEvents([session], ['session_start']);
    expect(events.filter((e) => e.type === 'pre_tool_use')).toHaveLength(0);
  });

  it('scopes event id to sessionId:toolCallId', () => {
    const session = makeSession('sess-42', {
      toolCalls: [makeToolCall('call-7', 2000)],
    });
    const events = buildInlineEvents([session], ['pre_tool_use']);
    expect(events[0].id).toBe('sess-42:call-7');
  });
});

describe('buildInlineEvents — sorting', () => {
  it('returns events sorted by timestamp ascending', () => {
    const session = makeSession('s1', {
      startedAt: 5000,
      completedAt: 1000,
      toolCalls: [makeToolCall('c1', 3000)],
    });
    const events = buildInlineEvents([session], ['session_start', 'session_end', 'pre_tool_use']);
    const timestamps = events.map((e) => e.timestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it('merges and sorts events from multiple sessions', () => {
    const s1 = makeSession('s1', { startedAt: 4000, completedAt: undefined });
    const s2 = makeSession('s2', { startedAt: 2000, completedAt: undefined });
    const events = buildInlineEvents([s1, s2], ['session_start']);
    expect(events[0].timestamp).toBe(2000);
    expect(events[1].timestamp).toBe(4000);
  });
});

// ─── eventsInSlot ─────────────────────────────────────────────────────────────

describe('eventsInSlot', () => {
  const events = [
    { id: 'e1', type: 'pre_tool_use', timestamp: 100 },
    { id: 'e2', type: 'pre_tool_use', timestamp: 200 },
    { id: 'e3', type: 'pre_tool_use', timestamp: 300 },
  ];

  it('returns events in the half-open interval [after, before)', () => {
    const result = eventsInSlot(events, { after: 100, before: 300 });
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('includes event at exactly after boundary', () => {
    const result = eventsInSlot(events, { after: 200, before: 400 });
    expect(result.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  it('excludes event at exactly before boundary', () => {
    const result = eventsInSlot(events, { after: 0, before: 200 });
    expect(result.map((e) => e.id)).toEqual(['e1']);
  });

  it('returns [] when no events fall in slot', () => {
    expect(eventsInSlot(events, { after: 500, before: 1000 })).toEqual([]);
  });

  it('returns [] for empty events array', () => {
    expect(eventsInSlot([], { after: 0, before: 1000 })).toEqual([]);
  });
});
