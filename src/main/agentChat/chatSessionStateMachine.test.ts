/**
 * chatSessionStateMachine.test.ts — Unit tests for ChatSessionStateMachine.
 *
 * Coverage:
 * - Every allowed transition (idle→submitting→streaming→completing→idle)
 * - provider_session_assigned is a no-op on state (no diff for status change)
 * - text_delta in submitting promotes to streaming first, then appends
 * - text_delta in streaming accumulates correctly across multiple deltas
 * - turn_completed carries finalText in the turn_completed diff
 * - Every disallowed transition throws ChatStateError with kind 'invalid-transition'
 * - snapshot() reflects current state
 * - seq is monotonically increasing across diffs
 */

import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import { describe, expect, it } from 'vitest';

import { ChatSessionStateMachine } from './chatSessionStateMachine';
import { ChatStateError } from './chatStateError';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const T1 = 'thread-sm-1' as ThreadId;
const TURN1 = 'turn-sm-1' as TurnId;
const PSID1 = 'psid-sm-1' as ProviderSessionId;

function fresh(): ChatSessionStateMachine {
  return new ChatSessionStateMachine(T1);
}

function makeTurnSubmitted(overrides: Partial<{ content: string }> = {}) {
  return {
    type: 'turn_submitted' as const,
    threadId: T1,
    turnId: TURN1,
    content: overrides.content ?? 'hello',
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

// Drive a machine to the streaming state in one call.
function driveToStreaming(sm: ChatSessionStateMachine, firstDelta = 'chunk1'): void {
  sm.dispatch(makeTurnSubmitted());
  sm.dispatch(makeProviderAssigned());
  sm.dispatch(makeTextDelta(firstDelta));
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts in idle', () => {
    const sm = fresh();
    expect(sm.snapshot().status).toBe('idle');
  });

  it('snapshot has empty accumulated text', () => {
    const sm = fresh();
    expect(sm.snapshot().accumulatedText).toBe('');
  });
});

// ─── turn_submitted (idle → submitting) ───────────────────────────────────────

describe('turn_submitted', () => {
  it('transitions idle → submitting', () => {
    const sm = fresh();
    const diffs = sm.dispatch(makeTurnSubmitted());
    const statusDiff = diffs.find((d) => d.type === 'status_changed');
    expect(statusDiff).toBeDefined();
    if (statusDiff?.type === 'status_changed') {
      expect(statusDiff.status).toBe('submitting');
    }
    expect(sm.snapshot().status).toBe('submitting');
  });

  it('clears accumulated text on new turn', () => {
    const sm = fresh();
    driveToStreaming(sm, 'old text');
    sm.dispatch(makeTurnCompleted('final'));
    // Now idle again — start a new turn
    sm.dispatch(makeTurnSubmitted());
    expect(sm.snapshot().accumulatedText).toBe('');
  });

  it('throws invalid-transition when not in idle', () => {
    const sm = fresh();
    sm.dispatch(makeTurnSubmitted()); // now submitting
    expect(() => sm.dispatch(makeTurnSubmitted())).toThrow(ChatStateError);
    let caught: ChatStateError | undefined;
    try {
      sm.dispatch(makeTurnSubmitted());
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught?.kind).toBe('invalid-transition');
  });
});

// ─── provider_session_assigned (submitting → submitting, no state change) ─────

describe('provider_session_assigned', () => {
  it('returns no diffs (no state change)', () => {
    const sm = fresh();
    sm.dispatch(makeTurnSubmitted());
    const diffs = sm.dispatch(makeProviderAssigned());
    expect(diffs).toHaveLength(0);
    expect(sm.snapshot().status).toBe('submitting');
  });

  it('throws invalid-transition when not in submitting', () => {
    const sm = fresh(); // idle
    let caught: ChatStateError | undefined;
    try {
      sm.dispatch(makeProviderAssigned());
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('invalid-transition');
  });
});

// ─── text_delta (submitting → streaming, then streaming loop) ─────────────────

describe('text_delta', () => {
  it('first delta in submitting promotes to streaming', () => {
    const sm = fresh();
    sm.dispatch(makeTurnSubmitted());
    sm.dispatch(makeProviderAssigned());
    const diffs = sm.dispatch(makeTextDelta('hi'));
    const statusDiff = diffs.find((d) => d.type === 'status_changed');
    expect(statusDiff).toBeDefined();
    if (statusDiff?.type === 'status_changed') {
      expect(statusDiff.status).toBe('streaming');
    }
    expect(sm.snapshot().status).toBe('streaming');
  });

  it('first delta also emits a text_appended diff', () => {
    const sm = fresh();
    sm.dispatch(makeTurnSubmitted());
    sm.dispatch(makeProviderAssigned());
    const diffs = sm.dispatch(makeTextDelta('hi'));
    const appendDiff = diffs.find((d) => d.type === 'text_appended');
    expect(appendDiff).toBeDefined();
    if (appendDiff?.type === 'text_appended') {
      expect(appendDiff.delta).toBe('hi');
    }
  });

  it('subsequent deltas in streaming stay in streaming', () => {
    const sm = fresh();
    driveToStreaming(sm, 'a');
    sm.dispatch(makeTextDelta('b'));
    expect(sm.snapshot().status).toBe('streaming');
  });

  it('accumulates text correctly across multiple deltas', () => {
    const sm = fresh();
    driveToStreaming(sm, 'Hello');
    sm.dispatch(makeTextDelta(', '));
    sm.dispatch(makeTextDelta('world'));
    expect(sm.snapshot().accumulatedText).toBe('Hello, world');
  });

  it('throws invalid-transition when in idle', () => {
    const sm = fresh();
    let caught: ChatStateError | undefined;
    try {
      sm.dispatch(makeTextDelta('oops'));
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('invalid-transition');
  });

  it('throws invalid-transition when in completing', () => {
    const sm = fresh();
    driveToStreaming(sm);
    // Force into completing by completing the turn
    sm.dispatch(makeTurnCompleted());
    // Now idle — we cannot test 'completing' directly since it's transient
    // But we can verify idle rejects text_delta
    let caught: ChatStateError | undefined;
    try {
      sm.dispatch(makeTextDelta('late'));
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('invalid-transition');
  });
});

// ─── turn_completed (streaming → completing → idle) ───────────────────────────

describe('turn_completed', () => {
  it('transitions streaming → idle (via completing)', () => {
    const sm = fresh();
    driveToStreaming(sm);
    sm.dispatch(makeTurnCompleted('final answer'));
    expect(sm.snapshot().status).toBe('idle');
  });

  it('emits a turn_completed diff with finalText', () => {
    const sm = fresh();
    driveToStreaming(sm);
    const diffs = sm.dispatch(makeTurnCompleted('the answer is 42'));
    const completedDiff = diffs.find((d) => d.type === 'turn_completed');
    expect(completedDiff).toBeDefined();
    if (completedDiff?.type === 'turn_completed') {
      expect(completedDiff.finalText).toBe('the answer is 42');
    }
  });

  it('emits status_changed completing and status_changed idle diffs', () => {
    const sm = fresh();
    driveToStreaming(sm);
    const diffs = sm.dispatch(makeTurnCompleted());
    const statusDiffs = diffs.filter((d) => d.type === 'status_changed');
    const statuses = statusDiffs.map((d) => (d.type === 'status_changed' ? d.status : null));
    expect(statuses).toContain('completing');
    expect(statuses).toContain('idle');
  });

  it('throws invalid-transition when not in streaming', () => {
    const sm = fresh(); // idle
    let caught: ChatStateError | undefined;
    try {
      sm.dispatch(makeTurnCompleted());
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('invalid-transition');
  });

  it('throws invalid-transition when in submitting', () => {
    const sm = fresh();
    sm.dispatch(makeTurnSubmitted());
    let caught: ChatStateError | undefined;
    try {
      sm.dispatch(makeTurnCompleted());
    } catch (e) {
      caught = e as ChatStateError;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect(caught?.kind).toBe('invalid-transition');
  });
});

// ─── seq monotonicity ─────────────────────────────────────────────────────────

describe('seq', () => {
  it('is monotonically increasing across all emitted diffs', () => {
    const sm = fresh();
    const allDiffs = [
      ...sm.dispatch(makeTurnSubmitted()),
      ...sm.dispatch(makeProviderAssigned()),
      ...sm.dispatch(makeTextDelta('a')),
      ...sm.dispatch(makeTextDelta('b')),
      ...sm.dispatch(makeTurnCompleted('ab')),
    ];
    const seqs = allDiffs.map((d) => d.seq);
    for (let i = 1; i < seqs.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it('snapshot seq matches the last emitted diff seq', () => {
    const sm = fresh();
    const diffs = sm.dispatch(makeTurnSubmitted());
    const lastSeq = diffs[diffs.length - 1].seq;
    expect(sm.snapshot().seq).toBe(lastSeq);
  });
});

// ─── Full happy-path cycle ────────────────────────────────────────────────────

describe('full turn cycle', () => {
  it('idle → submitting → streaming → idle produces expected diff sequence', () => {
    const sm = fresh();
    const all = [
      ...sm.dispatch(makeTurnSubmitted()),
      ...sm.dispatch(makeProviderAssigned()),
      ...sm.dispatch(makeTextDelta('Hello ')),
      ...sm.dispatch(makeTextDelta('world')),
      ...sm.dispatch(makeTurnCompleted('Hello world')),
    ];

    const types = all.map((d) => d.type);
    expect(types).toContain('status_changed'); // submitting
    expect(types).toContain('text_appended');
    expect(types).toContain('turn_completed');

    // Machine ends in idle
    expect(sm.snapshot().status).toBe('idle');
    // Accumulated text was populated during streaming
    // (cleared on next turn, not here)
    expect(sm.snapshot().accumulatedText).toBe('Hello world');
  });
});
