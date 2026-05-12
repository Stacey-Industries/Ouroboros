/**
 * hooksShadowTap.test.ts — Smoke tests for tapShadowPath.
 *
 * Coverage:
 * - no-ops when shadow tap is not installed
 * - forwards onHookEvent with camelCase→snake_case mapping when tap is installed
 * - maps session_id, toolName, toolCallId, decision, input correctly
 * - cleans up tap after each test
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearShadowTap, setShadowTap } from './agentChat/shadowTap';
import { tapShadowPath } from './hooksShadowTap';

function makeFakeTap() {
  const calls: unknown[] = [];
  return {
    onHookEvent: vi.fn((payload: unknown) => {
      calls.push(payload);
    }),
    onStreamJsonEvent: vi.fn(),
    onCommand: vi.fn(),
    reportTerminal: vi.fn(),
    registry: {} as never,
    _calls: calls,
  };
}

function makePayload(overrides: Record<string, unknown> = {}): import('./hooks').HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'sess-123',
    timestamp: 1000,
    toolName: 'Bash',
    toolCallId: 'tc-1',
    input: { cmd: 'ls' },
    data: { decision: 'ask', file_names: ['CLAUDE.md'], total_count: 1 },
    ...overrides,
  } as import('./hooks').HookPayload;
}

afterEach(() => {
  clearShadowTap();
});

describe('tapShadowPath', () => {
  it('no-ops when no shadow tap is installed', () => {
    // Should not throw even with no tap registered.
    expect(() => tapShadowPath(makePayload())).not.toThrow();
  });

  it('calls onHookEvent with snake_case session_id', () => {
    const tap = makeFakeTap();
    setShadowTap(tap as never);
    tapShadowPath(makePayload({ sessionId: 'my-session' }));
    expect(tap.onHookEvent).toHaveBeenCalledOnce();
    const arg = tap.onHookEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['session_id']).toBe('my-session');
  });

  it('maps toolName and toolCallId through', () => {
    const tap = makeFakeTap();
    setShadowTap(tap as never);
    tapShadowPath(makePayload({ toolName: 'Read', toolCallId: 'tc-42' }));
    const arg = tap.onHookEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['toolName']).toBe('Read');
    expect(arg['toolCallId']).toBe('tc-42');
  });

  it('maps decision from payload.data', () => {
    const tap = makeFakeTap();
    setShadowTap(tap as never);
    tapShadowPath(makePayload({ data: { decision: 'deny' } }));
    const arg = tap.onHookEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['decision']).toBe('deny');
  });

  it('maps fileNames and totalCount from payload.data', () => {
    const tap = makeFakeTap();
    setShadowTap(tap as never);
    tapShadowPath(makePayload({ data: { file_names: ['a.md', 'b.md'], total_count: 2 } }));
    const arg = tap.onHookEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['fileNames']).toEqual(['a.md', 'b.md']);
    expect(arg['totalCount']).toBe(2);
  });

  it('passes through the event type unchanged', () => {
    const tap = makeFakeTap();
    setShadowTap(tap as never);
    tapShadowPath(makePayload({ type: 'post_tool_use' as never }));
    const arg = tap.onHookEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['type']).toBe('post_tool_use');
  });
});
