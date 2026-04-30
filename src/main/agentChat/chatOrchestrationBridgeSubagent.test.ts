/**
 * chatOrchestrationBridgeSubagent.test.ts
 *
 * Verifies:
 *   - Stable child session ID minting (same inputs → same ID)
 *   - emitChatSubagentStart dispatches agent_start with correct parent_session_id
 *   - emitChatSubagentStart is idempotent (double-call emits once)
 *   - emitChatSubagentEnd is idempotent (double-call emits once)
 *   - emitChatSubagentEnd carries correct stop_reason for all three statuses
 *   - Flag off → no dispatch calls at all
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('../hooks', () => ({
  dispatchSyntheticHookEvent: vi.fn(),
}));

vi.mock('./subagentLinkTrace', () => ({
  traceLink: vi.fn(),
}));

import { getConfigValue } from '../config';
import { dispatchSyntheticHookEvent } from '../hooks';
import { emitChatSubagentEnd, emitChatSubagentStart } from './chatOrchestrationBridgeSubagent';
import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';

const mockGetConfigValue = vi.mocked(getConfigValue);
const mockDispatch = vi.mocked(dispatchSyntheticHookEvent);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setFlagEnabled(enabled: boolean): void {
  mockGetConfigValue.mockReturnValue({
    subagentDisplay: { enabled },
  } as ReturnType<typeof getConfigValue>);
}

function makeCtx(overrides: Partial<ActiveStreamContext> = {}): ActiveStreamContext {
  return {
    threadId: 'thread-abc',
    assistantMessageId: 'msg-1',
    taskId: 'task-1',
    sessionId: 'sess-1',
    link: {},
    accumulatedText: '',
    firstChunkEmitted: false,
    model: 'sonnet',
    bufferedChunks: [],
    chunkSequence: 0,
    toolsUsed: [],
    accumulatedBlocks: [],
    monitorStartEmitted: false,
    streamEnded: false,
    chatSubagentEmissions: new Map(),
    ...overrides,
  } as ActiveStreamContext;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('emitChatSubagentStart — stable ID minting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFlagEnabled(true);
  });

  it('produces the same child session ID for the same inputs', () => {
    const ctx = makeCtx({ threadId: 'thread-1' });
    emitChatSubagentStart(ctx, { toolCallId: 'call-1' });

    const call = mockDispatch.mock.calls[0][0];
    expect(call.sessionId).toBe('chat-sub:thread-1:call-1');
  });

  it('produces distinct IDs for different toolCallIds', () => {
    const ctx = makeCtx({ threadId: 'thread-1' });
    emitChatSubagentStart(ctx, { toolCallId: 'call-A' });
    emitChatSubagentStart(ctx, { toolCallId: 'call-B' });

    const ids = mockDispatch.mock.calls.map((c) => c[0].sessionId);
    expect(ids[0]).toBe('chat-sub:thread-1:call-A');
    expect(ids[1]).toBe('chat-sub:thread-1:call-B');
  });
});

describe('emitChatSubagentStart — parent linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFlagEnabled(true);
  });

  it('dispatches agent_start with type=agent_start', () => {
    const ctx = makeCtx({ threadId: 'parent-session' });
    emitChatSubagentStart(ctx, { toolCallId: 'tool-1' });

    const call = mockDispatch.mock.calls[0][0];
    expect(call.type).toBe('agent_start');
  });

  it('dispatches agent_start with correct parent_session_id', () => {
    const ctx = makeCtx({ threadId: 'parent-session' });
    emitChatSubagentStart(ctx, { toolCallId: 'tool-1' });

    const call = mockDispatch.mock.calls[0][0];
    expect(call.parentSessionId).toBe('parent-session');
  });

  it('dispatches agent_start with child sessionId derived from threadId and toolCallId', () => {
    const ctx = makeCtx({ threadId: 'thr-xyz' });
    emitChatSubagentStart(ctx, { toolCallId: 'stream-sess-5' });

    const call = mockDispatch.mock.calls[0][0];
    expect(call.sessionId).toBe('chat-sub:thr-xyz:stream-sess-5');
  });
});

describe('emitChatSubagentStart — idempotence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFlagEnabled(true);
  });

  it('only dispatches once when called twice with the same toolCallId', () => {
    const ctx = makeCtx();
    emitChatSubagentStart(ctx, { toolCallId: 'call-1' });
    emitChatSubagentStart(ctx, { toolCallId: 'call-1' });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('dispatches twice when called with different toolCallIds', () => {
    const ctx = makeCtx();
    emitChatSubagentStart(ctx, { toolCallId: 'call-1' });
    emitChatSubagentStart(ctx, { toolCallId: 'call-2' });

    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });
});

describe('emitChatSubagentEnd — idempotence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFlagEnabled(true);
  });

  it('only dispatches once when called twice with the same toolCallId', () => {
    const ctx = makeCtx();
    emitChatSubagentEnd(ctx, { toolCallId: 'call-1' }, 'success');
    emitChatSubagentEnd(ctx, { toolCallId: 'call-1' }, 'success');

    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('dispatches twice when called with different toolCallIds', () => {
    const ctx = makeCtx();
    emitChatSubagentEnd(ctx, { toolCallId: 'call-A' }, 'success');
    emitChatSubagentEnd(ctx, { toolCallId: 'call-B' }, 'error');

    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });
});

describe('emitChatSubagentEnd — stop_reason per status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFlagEnabled(true);
  });

  it('includes stop_reason=success in data for success status', () => {
    const ctx = makeCtx();
    emitChatSubagentEnd(ctx, { toolCallId: 'c1' }, 'success');

    const call = mockDispatch.mock.calls[0][0];
    expect(call.type).toBe('agent_end');
    expect((call.data as Record<string, unknown>)?.stop_reason).toBe('success');
  });

  it('includes stop_reason=error in data for error status', () => {
    const ctx = makeCtx();
    emitChatSubagentEnd(ctx, { toolCallId: 'c2' }, 'error');

    const call = mockDispatch.mock.calls[0][0];
    expect((call.data as Record<string, unknown>)?.stop_reason).toBe('error');
  });

  it('includes stop_reason=cancelled in data for cancelled status', () => {
    const ctx = makeCtx();
    emitChatSubagentEnd(ctx, { toolCallId: 'c3' }, 'cancelled');

    const call = mockDispatch.mock.calls[0][0];
    expect((call.data as Record<string, unknown>)?.stop_reason).toBe('cancelled');
  });

  it('emits agent_end with correct child sessionId', () => {
    const ctx = makeCtx({ threadId: 'thr-end' });
    emitChatSubagentEnd(ctx, { toolCallId: 'end-call' }, 'success');

    const call = mockDispatch.mock.calls[0][0];
    expect(call.sessionId).toBe('chat-sub:thr-end:end-call');
  });
});

describe('flag off — no dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFlagEnabled(false);
  });

  it('emitChatSubagentStart does not dispatch when flag is off', () => {
    const ctx = makeCtx();
    emitChatSubagentStart(ctx, { toolCallId: 'call-1' });

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('emitChatSubagentEnd does not dispatch when flag is off', () => {
    const ctx = makeCtx();
    emitChatSubagentEnd(ctx, { toolCallId: 'call-1' }, 'success');

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('emitChatSubagentStart does not dispatch when config is undefined', () => {
    mockGetConfigValue.mockReturnValue(undefined as ReturnType<typeof getConfigValue>);
    const ctx = makeCtx();
    emitChatSubagentStart(ctx, { toolCallId: 'call-x' });

    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
