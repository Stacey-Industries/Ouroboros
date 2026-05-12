/**
 * chatStateBroadcaster.test.ts — Unit tests for ChatStateBroadcaster.
 *
 * Coverage:
 * - subscribe sends snapshot immediately to the new subscriber
 * - unsubscribe stops further diffs from reaching that subscriber
 * - dispatch fans diffs out to all subscribed webContents
 * - snapshot returns current state for a known thread
 * - snapshot throws ChatStateError (unknown-thread) for an unknown thread
 * - ensureThread creates a machine without needing a dispatch first
 */

import { diffChannel, snapshotChannel } from '@shared/ipc/chatStateChannels';
import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import { describe, expect, it, vi } from 'vitest';

import { ChatStateBroadcaster } from './chatStateBroadcaster';
import { ChatStateError } from './chatStateError';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const T1 = 'thread-bc-1' as ThreadId;
const TURN1 = 'turn-bc-1' as TurnId;
const PSID1 = 'psid-bc-1' as ProviderSessionId;

function mockWebContents() {
  return {
    send: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  };
}

function makeTurnSubmitted() {
  return {
    type: 'turn_submitted' as const,
    threadId: T1,
    turnId: TURN1,
    content: 'hello',
    preSnapshotHash: null,
    resolvedProvider: 'claude-code',
    resolvedModel: 'provider-default',
    resolvedEffort: 'medium',
    resolvedPermissionMode: null,
    ts: Date.now(),
    seq: 0,
  };
}

function makeProviderAssigned() {
  return {
    type: 'provider_session_assigned' as const,
    threadId: T1,
    turnId: TURN1,
    providerSessionId: PSID1,
    ts: Date.now(),
    seq: 0,
  };
}

function makeTextDelta(delta: string) {
  return {
    type: 'text_delta' as const,
    threadId: T1,
    turnId: TURN1,
    delta,
    ts: Date.now(),
    seq: 0,
  };
}

function makeTurnCompleted(finalText = 'done') {
  return {
    type: 'turn_completed' as const,
    threadId: T1,
    turnId: TURN1,
    finalText,
    ts: Date.now(),
    seq: 0,
  };
}

// ─── snapshot ────────────────────────────────────────────────────────────────

describe('snapshot', () => {
  it('throws unknown-thread for a thread that was never seen', () => {
    const bc = new ChatStateBroadcaster();
    let caught: ChatStateError | undefined;
    try {
      bc.snapshot(T1);
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('unknown-thread');
  });

  it('returns idle snapshot after ensureThread', () => {
    const bc = new ChatStateBroadcaster();
    bc.ensureThread(T1);
    const snap = bc.snapshot(T1);
    expect(snap.status).toBe('idle');
    expect(snap.threadId).toBe(T1);
  });

  it('reflects state after dispatch', () => {
    const bc = new ChatStateBroadcaster();
    bc.dispatch(makeTurnSubmitted());
    expect(bc.snapshot(T1).status).toBe('submitting');
  });
});

// ─── subscribe ────────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('immediately sends chatState:snapshot to the new subscriber', () => {
    const bc = new ChatStateBroadcaster();
    bc.ensureThread(T1);
    const wc = mockWebContents();

    bc.subscribe(T1, wc as never);

    expect(wc.send).toHaveBeenCalledWith(
      snapshotChannel(T1),
      expect.objectContaining({
        threadId: T1,
        status: 'idle',
      }),
    );
  });

  it('returns an unsubscribe function', () => {
    const bc = new ChatStateBroadcaster();
    bc.ensureThread(T1);
    const wc = mockWebContents();
    const unsub = bc.subscribe(T1, wc as never);
    expect(typeof unsub).toBe('function');
  });
});

// ─── dispatch fan-out ─────────────────────────────────────────────────────────

describe('dispatch', () => {
  it('fans diffs out to subscribed webContents', () => {
    const bc = new ChatStateBroadcaster();
    bc.ensureThread(T1);
    const wc = mockWebContents();
    bc.subscribe(T1, wc as never);
    wc.send.mockClear(); // clear the snapshot send

    bc.dispatch(makeTurnSubmitted());

    // Should have received chatState:diff for status_changed → submitting
    const diffCalls = wc.send.mock.calls.filter((c: unknown[]) => c[0] === diffChannel(T1));
    expect(diffCalls.length).toBeGreaterThan(0);
    const statuses = diffCalls
      .map((c: unknown[]) => c[1])
      .filter((d: { type?: string }) => d.type === 'status_changed')
      .map((d: { status?: string }) => d.status);
    expect(statuses).toContain('submitting');
  });

  it('does NOT fan out diffs to unsubscribed webContents', () => {
    const bc = new ChatStateBroadcaster();
    bc.ensureThread(T1);
    const wc = mockWebContents();
    const unsub = bc.subscribe(T1, wc as never);
    unsub(); // unsubscribe before dispatching
    wc.send.mockClear();

    bc.dispatch(makeTurnSubmitted());

    const diffCalls = wc.send.mock.calls.filter((c: unknown[]) => c[0] === diffChannel(T1));
    expect(diffCalls.length).toBe(0);
  });

  it('sends no diffs for provider_session_assigned (no state change)', () => {
    const bc = new ChatStateBroadcaster();
    bc.dispatch(makeTurnSubmitted()); // idle → submitting
    const wc = mockWebContents();
    bc.subscribe(T1, wc as never);
    wc.send.mockClear();

    bc.dispatch(makeProviderAssigned()); // no state change → no diffs

    const diffCalls = wc.send.mock.calls.filter((c: unknown[]) => c[0] === diffChannel(T1));
    expect(diffCalls.length).toBe(0);
  });

  it('fans text_appended diffs on text_delta dispatch', () => {
    const bc = new ChatStateBroadcaster();
    bc.dispatch(makeTurnSubmitted());
    bc.dispatch(makeProviderAssigned());
    const wc = mockWebContents();
    bc.subscribe(T1, wc as never);
    wc.send.mockClear();

    bc.dispatch(makeTextDelta('hello'));

    const appendDiffs = wc.send.mock.calls
      .filter((c: unknown[]) => c[0] === diffChannel(T1))
      .map((c: unknown[]) => c[1])
      .filter((d: { type?: string }) => d.type === 'text_appended');
    expect(appendDiffs.length).toBe(1);
    expect((appendDiffs[0] as { delta: string }).delta).toBe('hello');
  });
});

// ─── full cycle via broadcaster ───────────────────────────────────────────────

describe('full turn cycle via broadcaster', () => {
  it('subscriber receives all expected diff types across a complete turn', () => {
    const bc = new ChatStateBroadcaster();
    bc.ensureThread(T1);
    const wc = mockWebContents();
    bc.subscribe(T1, wc as never);
    wc.send.mockClear();

    bc.dispatch(makeTurnSubmitted());
    bc.dispatch(makeProviderAssigned());
    bc.dispatch(makeTextDelta('Hi'));
    bc.dispatch(makeTurnCompleted('Hi'));

    const allDiffPayloads = wc.send.mock.calls
      .filter((c: unknown[]) => c[0] === diffChannel(T1))
      .map((c: unknown[]) => c[1] as { type: string });

    const types = allDiffPayloads.map((d) => d.type);
    expect(types).toContain('status_changed');
    expect(types).toContain('text_appended');
    expect(types).toContain('turn_completed');

    // Phase 3: turn_completed → completing; message_committed drives to idle.
    expect(bc.snapshot(T1).status).toBe('completing');
    bc.dispatch({
      type: 'message_committed' as const,
      threadId: T1,
      turnId: TURN1,
      messageId: 'msg-bc-1' as never,
      ts: Date.now(),
      seq: 0,
    });
    expect(bc.snapshot(T1).status).toBe('idle');
  });
});
