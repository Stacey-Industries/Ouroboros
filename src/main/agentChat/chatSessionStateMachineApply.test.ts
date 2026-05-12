/**
 * chatSessionStateMachineApply.test.ts — Smoke tests for the apply split file.
 *
 * chatSessionStateMachineApply.ts is an internal implementation split of
 * chatSessionStateMachine.ts (extracted to stay under ESLint line limits).
 * The full behavioral coverage lives in chatSessionStateMachine.test.ts.
 *
 * This file covers the one surface that chatSessionStateMachine.test.ts
 * does not exercise: verifying that the applyEvent function is wired
 * correctly through the ChatSessionStateMachine.dispatch() path for
 * Phase 3 event types that weren't present in Phase 1 tests.
 */

import type { MessageId, ThreadId, ToolUseId, TurnId } from '@shared/types/canonicalChatEvent';
import { describe, expect, it } from 'vitest';

import { ChatSessionStateMachine } from './chatSessionStateMachine';
import { ChatStateError } from './chatStateError';

const T = 'thread-apply-test' as ThreadId;
const TURN = 'turn-apply-test' as TurnId;
const TOOL_ID = 'tool-use-apply-1' as ToolUseId;
const MSG_ID = 'msg-apply-1' as MessageId;

function fresh(): ChatSessionStateMachine {
  return new ChatSessionStateMachine(T);
}

function driveToStreaming(sm: ChatSessionStateMachine): void {
  sm.dispatch({ type: 'turn_submitted', threadId: T, turnId: TURN, content: 'hi', ts: 1, seq: 0 });
  sm.dispatch({
    type: 'provider_session_assigned',
    threadId: T,
    turnId: TURN,
    providerSessionId: 'psid' as never,
    ts: 1,
    seq: 0,
  });
  sm.dispatch({ type: 'text_delta', threadId: T, turnId: TURN, delta: 'hello', ts: 1, seq: 0 });
}

// ─── TOOL_RUNNING state ───────────────────────────────────────────────────────

describe('tool_call_started / tool_call_input_delta / tool_call_completed', () => {
  it('streaming → tool_running on tool_call_started', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'tool_call_started',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      name: 'Bash',
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('tool_running');
  });

  it('tool_call_input_delta accumulates input json', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'tool_call_started',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      name: 'Bash',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({
      type: 'tool_call_input_delta',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      delta: '{"cm',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({
      type: 'tool_call_input_delta',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      delta: 'd":"ls"}',
      ts: 1,
      seq: 0,
    });
    const inFlight = sm.toolCallsInFlight.get(TOOL_ID);
    expect(inFlight?.inputJson).toBe('{"cmd":"ls"}');
  });

  it('tool_call_completed returns to streaming', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'tool_call_started',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      name: 'Bash',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({
      type: 'tool_call_completed',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      finalInput: '{}',
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('streaming');
  });

  it('tool_call_started throws when not in streaming', () => {
    const sm = fresh();
    sm.dispatch({
      type: 'turn_submitted',
      threadId: T,
      turnId: TURN,
      content: 'hi',
      ts: 1,
      seq: 0,
    });
    expect(() =>
      sm.dispatch({
        type: 'tool_call_started',
        threadId: T,
        turnId: TURN,
        toolUseId: TOOL_ID,
        name: 'Bash',
        ts: 1,
        seq: 0,
      }),
    ).toThrow(ChatStateError);
  });
});

// ─── tool_result_observed ─────────────────────────────────────────────────────

describe('tool_result_observed', () => {
  it('records result content in streaming state', () => {
    const sm = fresh();
    driveToStreaming(sm);
    // Drive through a tool call cycle first so we're back in streaming.
    sm.dispatch({
      type: 'tool_call_started',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      name: 'Bash',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({
      type: 'tool_call_completed',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      finalInput: '{}',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({
      type: 'tool_result_observed',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      content: 'output text',
      ts: 1,
      seq: 0,
    });
    expect(sm.toolResults.get(TOOL_ID)).toBe('output text');
    expect(sm.snapshot().status).toBe('streaming');
  });
});

// ─── tool_permission_requested / resolved ─────────────────────────────────────

describe('tool_permission_requested / tool_permission_resolved', () => {
  it('sets and clears awaitingPermission sub-flag', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'tool_call_started',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      name: 'Bash',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({
      type: 'tool_permission_requested',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      request: 'allow?',
      ts: 1,
      seq: 0,
    });
    expect(sm.awaitingPermission.has(TOOL_ID)).toBe(true);
    sm.dispatch({
      type: 'tool_permission_resolved',
      threadId: T,
      turnId: TURN,
      toolUseId: TOOL_ID,
      decision: 'allow',
      ts: 1,
      seq: 0,
    });
    expect(sm.awaitingPermission.has(TOOL_ID)).toBe(false);
    expect(sm.snapshot().status).toBe('tool_running');
  });
});

// ─── instructions_loaded (any state) ─────────────────────────────────────────

describe('instructions_loaded', () => {
  it('accepted in idle state without state change', () => {
    const sm = fresh();
    sm.dispatch({
      type: 'instructions_loaded',
      threadId: T,
      fileNames: ['CLAUDE.md'],
      totalCount: 1,
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('idle');
  });

  it('accepted in streaming state without state change', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'instructions_loaded',
      threadId: T,
      fileNames: ['CLAUDE.md'],
      totalCount: 1,
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('streaming');
  });
});

// ─── turn_failed ──────────────────────────────────────────────────────────────

describe('turn_failed', () => {
  it('transitions from submitting to completing', () => {
    const sm = fresh();
    sm.dispatch({
      type: 'turn_submitted',
      threadId: T,
      turnId: TURN,
      content: 'hi',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({
      type: 'turn_failed',
      threadId: T,
      turnId: TURN,
      errorMessage: 'oops',
      subtype: 'error',
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('completing');
  });

  it('transitions from streaming to completing', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'turn_failed',
      threadId: T,
      turnId: TURN,
      errorMessage: 'oops',
      subtype: 'error',
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('completing');
  });

  it('throws from idle', () => {
    const sm = fresh();
    expect(() =>
      sm.dispatch({
        type: 'turn_failed',
        threadId: T,
        turnId: TURN,
        errorMessage: 'oops',
        subtype: 'error',
        ts: 1,
        seq: 0,
      }),
    ).toThrow(ChatStateError);
  });
});

// ─── turn_cancelled ───────────────────────────────────────────────────────────

describe('turn_cancelled', () => {
  it('transitions from submitting to completing', () => {
    const sm = fresh();
    sm.dispatch({
      type: 'turn_submitted',
      threadId: T,
      turnId: TURN,
      content: 'hi',
      ts: 1,
      seq: 0,
    });
    sm.dispatch({ type: 'turn_cancelled', threadId: T, turnId: TURN, ts: 1, seq: 0 });
    expect(sm.snapshot().status).toBe('completing');
  });

  it('throws from idle', () => {
    const sm = fresh();
    expect(() =>
      sm.dispatch({ type: 'turn_cancelled', threadId: T, turnId: TURN, ts: 1, seq: 0 }),
    ).toThrow(ChatStateError);
  });

  it('throws from completing', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'turn_completed',
      threadId: T,
      turnId: TURN,
      finalText: 'done',
      ts: 1,
      seq: 0,
    });
    expect(() =>
      sm.dispatch({ type: 'turn_cancelled', threadId: T, turnId: TURN, ts: 1, seq: 0 }),
    ).toThrow(ChatStateError);
  });
});

// ─── queue_appended ───────────────────────────────────────────────────────────

describe('queue_appended', () => {
  it('grows queue without changing state when idle', () => {
    const sm = fresh();
    sm.dispatch({
      type: 'queue_appended',
      threadId: T,
      queuedMessageId: MSG_ID,
      content: 'queued msg',
      ts: 1,
      seq: 0,
    });
    expect(sm.queue).toHaveLength(1);
    expect(sm.snapshot().status).toBe('idle');
  });

  it('throws when in completing state', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'turn_completed',
      threadId: T,
      turnId: TURN,
      finalText: 'done',
      ts: 1,
      seq: 0,
    });
    expect(() =>
      sm.dispatch({
        type: 'queue_appended',
        threadId: T,
        queuedMessageId: MSG_ID,
        content: 'too late',
        ts: 1,
        seq: 0,
      }),
    ).toThrow(ChatStateError);
  });
});

// ─── message_committed ────────────────────────────────────────────────────────

describe('message_committed', () => {
  it('transitions completing → idle and clears activeTurnId', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch({
      type: 'turn_completed',
      threadId: T,
      turnId: TURN,
      finalText: 'done',
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('completing');
    sm.dispatch({
      type: 'message_committed',
      threadId: T,
      turnId: TURN,
      messageId: MSG_ID,
      ts: 1,
      seq: 0,
    });
    expect(sm.snapshot().status).toBe('idle');
    expect(sm.snapshot().activeTurnId).toBeUndefined();
  });

  it('throws when not in completing', () => {
    const sm = fresh();
    expect(() =>
      sm.dispatch({
        type: 'message_committed',
        threadId: T,
        turnId: TURN,
        messageId: MSG_ID,
        ts: 1,
        seq: 0,
      }),
    ).toThrow(ChatStateError);
  });
});

// ─── dequeueHead / peekQueueHead ─────────────────────────────────────────────

describe('queue drain helpers', () => {
  it('dequeueHead removes and returns the head', () => {
    const sm = fresh();
    sm.dispatch({
      type: 'queue_appended',
      threadId: T,
      queuedMessageId: MSG_ID,
      content: 'first',
      ts: 1,
      seq: 0,
    });
    const head = sm.dequeueHead();
    expect(head?.content).toBe('first');
    expect(sm.queue).toHaveLength(0);
  });

  it('peekQueueHead returns without removing', () => {
    const sm = fresh();
    sm.dispatch({
      type: 'queue_appended',
      threadId: T,
      queuedMessageId: MSG_ID,
      content: 'peek',
      ts: 1,
      seq: 0,
    });
    expect(sm.peekQueueHead()?.content).toBe('peek');
    expect(sm.queue).toHaveLength(1);
  });
});
