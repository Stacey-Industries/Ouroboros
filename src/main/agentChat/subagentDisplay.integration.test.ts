/**
 * subagentDisplay.integration.test.ts
 *
 * Integration test: exercises the full subagent-display pipeline without
 * spinning up Electron.
 *
 * Three suites:
 *   - CLI path: tracker → enrichAgentStartPayload → renderer reducer
 *   - Chat path: emitChatSubagentStart / emitChatSubagentEnd
 *   - Idempotence: double-call emits only once
 *
 * Wave 57 Phase E.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks (must be hoisted above real imports) ───────────────────────────────

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
import { enrichAgentStartPayload } from '../hooksAgentStartEnrich';
import type { AgentAction, AgentState } from '../../renderer/hooks/useAgentEvents.helpers';
import { initialAgentState, reducer } from '../../renderer/hooks/useAgentEvents.helpers';
import { emitChatSubagentEnd, emitChatSubagentStart } from './chatOrchestrationBridgeSubagent';
import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';
import { _clearAll, recordStart } from './subagentTracker';

const mockGetConfigValue = vi.mocked(getConfigValue);
const mockDispatch = vi.mocked(dispatchSyntheticHookEvent);

// ─── Shared helpers ───────────────────────────────────────────────────────────

function enableFlag(): void {
  mockGetConfigValue.mockReturnValue({
    subagentDisplay: { enabled: true, diagnostics: false },
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

function dispatchStart(
  state: AgentState,
  action: Partial<Extract<AgentAction, { type: 'AGENT_START' }>> & { sessionId: string },
): AgentState {
  return reducer(state, {
    type: 'AGENT_START',
    taskLabel: 'task',
    timestamp: Date.now(),
    ...action,
  });
}

// ─── Stub window.electronAPI for renderer reducer diagnostic call ─────────────

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: {
        config: { getAll: vi.fn().mockResolvedValue({}) },
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  _clearAll();
});

// ─── CLI path ─────────────────────────────────────────────────────────────────

describe('CLI path — tracker → enrichAgentStartPayload → reducer', () => {
  it('enriches payload with parentSessionId when tracker has a record', () => {
    enableFlag();
    recordStart({ id: 'child-cli-1', parentSessionId: 'parent-cli-1' });

    const payload = {
      type: 'agent_start' as const,
      sessionId: 'child-cli-1',
      timestamp: 1000,
    };
    const enriched = enrichAgentStartPayload(payload);

    expect(enriched.parentSessionId).toBe('parent-cli-1');
    expect(enriched.sessionId).toBe('child-cli-1');
  });

  it('enriched payload feeds into reducer and produces session with parentSessionId', () => {
    enableFlag();
    recordStart({ id: 'child-cli-2', parentSessionId: 'parent-cli-2' });

    const payload = {
      type: 'agent_start' as const,
      sessionId: 'child-cli-2',
      timestamp: 2000,
    };
    const enriched = enrichAgentStartPayload(payload);
    const state = dispatchStart(initialAgentState, {
      sessionId: enriched.sessionId,
      parentSessionId: enriched.parentSessionId,
      timestamp: enriched.timestamp,
    });

    const session = state.sessions.find((s) => s.id === 'child-cli-2');
    expect(session).toBeDefined();
    expect(session?.parentSessionId).toBe('parent-cli-2');
  });

  it('does not enrich when flag is off', () => {
    mockGetConfigValue.mockReturnValue({
      subagentDisplay: { enabled: false },
    } as ReturnType<typeof getConfigValue>);
    recordStart({ id: 'child-cli-3', parentSessionId: 'parent-cli-3' });

    const payload = {
      type: 'agent_start' as const,
      sessionId: 'child-cli-3',
      timestamp: 3000,
    };
    const result = enrichAgentStartPayload(payload);

    expect(result).toBe(payload);
    expect(result.parentSessionId).toBeUndefined();
  });

  it('does not enrich when tracker has no record for child', () => {
    enableFlag();

    const payload = {
      type: 'agent_start' as const,
      sessionId: 'unknown-child',
      timestamp: 4000,
    };
    const result = enrichAgentStartPayload(payload);

    expect(result).toBe(payload);
    expect(result.parentSessionId).toBeUndefined();
  });
});

// ─── Chat path ────────────────────────────────────────────────────────────────

describe('Chat path — emitChatSubagentStart / emitChatSubagentEnd', () => {
  it('emitChatSubagentStart dispatches agent_start with parentSessionId=threadId', () => {
    enableFlag();
    const ctx = makeCtx({ threadId: 'parent-thread-1' });
    emitChatSubagentStart(ctx, { toolCallId: 'tc-1' });

    expect(mockDispatch).toHaveBeenCalledOnce();
    const call = mockDispatch.mock.calls[0][0];
    expect(call.type).toBe('agent_start');
    expect(call.parentSessionId).toBe('parent-thread-1');
    expect(call.sessionId).toBe('chat-sub:parent-thread-1:tc-1');
  });

  it('emitChatSubagentEnd dispatches agent_end with matching sessionId', () => {
    enableFlag();
    const ctx = makeCtx({ threadId: 'parent-thread-2' });
    emitChatSubagentStart(ctx, { toolCallId: 'tc-2' });
    emitChatSubagentEnd(ctx, { toolCallId: 'tc-2' }, 'success');

    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const endCall = mockDispatch.mock.calls[1][0];
    expect(endCall.type).toBe('agent_end');
    expect(endCall.sessionId).toBe('chat-sub:parent-thread-2:tc-2');
  });

  it('child sessionId format is chat-sub:{threadId}:{toolCallId}', () => {
    enableFlag();
    const ctx = makeCtx({ threadId: 'thr-xyz' });
    emitChatSubagentStart(ctx, { toolCallId: 'tool-abc' });

    const call = mockDispatch.mock.calls[0][0];
    expect(call.sessionId).toBe('chat-sub:thr-xyz:tool-abc');
  });
});

// ─── Idempotence ──────────────────────────────────────────────────────────────

describe('Idempotence — double-call emits only once', () => {
  it('emitChatSubagentStart called twice dispatches once', () => {
    enableFlag();
    const ctx = makeCtx({ threadId: 'idem-thread' });
    emitChatSubagentStart(ctx, { toolCallId: 'tc-idem' });
    emitChatSubagentStart(ctx, { toolCallId: 'tc-idem' });

    expect(mockDispatch).toHaveBeenCalledOnce();
  });

  it('emitChatSubagentEnd called twice dispatches once', () => {
    enableFlag();
    const ctx = makeCtx({ threadId: 'idem-thread-end' });
    emitChatSubagentEnd(ctx, { toolCallId: 'tc-idem-end' }, 'success');
    emitChatSubagentEnd(ctx, { toolCallId: 'tc-idem-end' }, 'success');

    expect(mockDispatch).toHaveBeenCalledOnce();
  });

  it('different toolCallIds produce separate emissions', () => {
    enableFlag();
    const ctx = makeCtx({ threadId: 'idem-thread-multi' });
    emitChatSubagentStart(ctx, { toolCallId: 'tc-a' });
    emitChatSubagentStart(ctx, { toolCallId: 'tc-b' });

    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const ids = mockDispatch.mock.calls.map((c) => c[0].sessionId);
    expect(ids).toContain('chat-sub:idem-thread-multi:tc-a');
    expect(ids).toContain('chat-sub:idem-thread-multi:tc-b');
  });
});
