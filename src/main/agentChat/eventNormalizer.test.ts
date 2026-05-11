/**
 * eventNormalizer.test.ts — Unit tests for EventNormalizer.
 *
 * Coverage:
 * - fromCommand produces correct turn_submitted shape
 * - fromStreamJson: provider_session_assigned on first session_id
 * - fromStreamJson: text_delta from assistant event with text content
 * - fromStreamJson: turn_completed from result/success event
 * - fromStreamJson: returns null for ignored event types (system, user, result/error)
 * - fromStreamJson: throws ChatStateError when turnId is unknown in registry
 * - fromHookEvent: always returns null (Phase 1 placeholder)
 */

import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import { describe, expect, it } from 'vitest';

import { ChatStateError } from './chatStateError';
import { EventNormalizer } from './eventNormalizer';
import { IdentityRegistry } from './identityRegistry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THREAD1 = 'thread-aaa' as ThreadId;
const TURN1 = 'turn-bbb' as TurnId;
const PSID1 = 'psid-ccc' as ProviderSessionId;

function makeNormalizer(): { norm: EventNormalizer; reg: IdentityRegistry } {
  const reg = new IdentityRegistry();
  const norm = new EventNormalizer(reg);
  return { norm, reg };
}

function makeSeenSet(...initial: ProviderSessionId[]): Set<ProviderSessionId> {
  return new Set(initial);
}

// ─── fromCommand ──────────────────────────────────────────────────────────────

describe('fromCommand', () => {
  it('produces a turn_submitted event with correct fields', () => {
    const { norm } = makeNormalizer();
    const evt = norm.fromCommand({ threadId: THREAD1, content: 'hello' }, TURN1);
    expect(evt.type).toBe('turn_submitted');
    expect(evt.threadId).toBe(THREAD1);
    expect(evt.turnId).toBe(TURN1);
    expect(evt.content).toBe('hello');
    expect(typeof evt.ts).toBe('number');
  });

  it('seq is 0 (placeholder — state machine overwrites)', () => {
    const { norm } = makeNormalizer();
    const evt = norm.fromCommand({ threadId: THREAD1, content: 'x' }, TURN1);
    expect(evt.seq).toBe(0);
  });
});

// ─── fromStreamJson: provider_session_assigned ────────────────────────────────

describe('fromStreamJson — provider_session_assigned', () => {
  it('emits provider_session_assigned for first event carrying session_id', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();

    const raw = { type: 'system', subtype: 'init', session_id: PSID1 } as never;
    const evt = norm.fromStreamJson(raw, TURN1, seen);

    expect(evt).not.toBeNull();
    expect(evt?.type).toBe('provider_session_assigned');
    if (evt?.type === 'provider_session_assigned') {
      expect(evt.providerSessionId).toBe(PSID1);
      expect(evt.threadId).toBe(THREAD1);
      expect(evt.turnId).toBe(TURN1);
    }
  });

  it('does NOT emit provider_session_assigned for the same session_id a second time', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet(PSID1); // already seen

    const raw = { type: 'system', subtype: 'init', session_id: PSID1 } as never;
    const evt = norm.fromStreamJson(raw, TURN1, seen);
    // session_id was already in the seen set, so it falls through to type handling
    // system events are dropped → null
    expect(evt).toBeNull();
  });

  it('adds the psid to the seenProviderSessionIds set', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();

    const raw = { type: 'system', subtype: 'init', session_id: PSID1 } as never;
    norm.fromStreamJson(raw, TURN1, seen);
    expect(seen.has(PSID1)).toBe(true);
  });
});

// ─── fromStreamJson: text_delta ───────────────────────────────────────────────

describe('fromStreamJson — text_delta', () => {
  it('emits text_delta for assistant event with text content', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();

    const raw = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] },
    } as never;
    const evt = norm.fromStreamJson(raw, TURN1, seen);

    expect(evt?.type).toBe('text_delta');
    if (evt?.type === 'text_delta') {
      expect(evt.delta).toBe('Hello world');
      expect(evt.threadId).toBe(THREAD1);
      expect(evt.turnId).toBe(TURN1);
    }
  });

  it('concatenates multiple text blocks into one delta', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();

    const raw = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'foo' },
          { type: 'thinking', thinking: 'internal' },
          { type: 'text', text: 'bar' },
        ],
      },
    } as never;
    const evt = norm.fromStreamJson(raw, TURN1, seen);
    expect(evt?.type).toBe('text_delta');
    if (evt?.type === 'text_delta') {
      expect(evt.delta).toBe('foobar');
    }
  });

  it('returns null for assistant event with no text blocks', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();

    const raw = {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: {} }] },
    } as never;
    const evt = norm.fromStreamJson(raw, TURN1, seen);
    expect(evt).toBeNull();
  });
});

// ─── fromStreamJson: turn_completed ──────────────────────────────────────────

describe('fromStreamJson — turn_completed', () => {
  it('emits turn_completed for result/success event', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();

    const raw = {
      type: 'result',
      subtype: 'success',
      result: 'Final answer',
      is_error: false,
    } as never;
    const evt = norm.fromStreamJson(raw, TURN1, seen);

    expect(evt?.type).toBe('turn_completed');
    if (evt?.type === 'turn_completed') {
      expect(evt.finalText).toBe('Final answer');
      expect(evt.threadId).toBe(THREAD1);
    }
  });

  it('returns null for result/error event (not handled in Phase 1)', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();

    const raw = { type: 'result', subtype: 'error', result: '', is_error: true } as never;
    const evt = norm.fromStreamJson(raw, TURN1, seen);
    expect(evt).toBeNull();
  });
});

// ─── fromStreamJson: ignored event types ──────────────────────────────────────

describe('fromStreamJson — ignored event types', () => {
  it('returns null for user events', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();
    const raw = { type: 'user', message: { role: 'user', content: 'hi' } } as never;
    expect(norm.fromStreamJson(raw, TURN1, seen)).toBeNull();
  });

  it('returns null for system events without session_id', () => {
    const { norm, reg } = makeNormalizer();
    reg.registerTurn(THREAD1, TURN1);
    const seen = makeSeenSet();
    const raw = { type: 'system', subtype: 'hook_started' } as never;
    expect(norm.fromStreamJson(raw, TURN1, seen)).toBeNull();
  });
});

// ─── fromStreamJson: unknown turnId throws ────────────────────────────────────

describe('fromStreamJson — unknown turnId', () => {
  it('throws ChatStateError unknown-turn when turnId is not in registry', () => {
    const { norm } = makeNormalizer();
    // TURN1 never registered
    const seen = makeSeenSet();
    const raw = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hi' }] },
    } as never;

    let caught: unknown;
    try {
      norm.fromStreamJson(raw, TURN1, seen);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect((caught as ChatStateError).kind).toBe('unknown-turn');
  });
});

// ─── fromHookEvent ────────────────────────────────────────────────────────────

describe('fromHookEvent', () => {
  it('returns null for all hook events (Phase 1 placeholder)', () => {
    const { norm } = makeNormalizer();
    expect(norm.fromHookEvent({ type: 'pre_tool_use', session_id: 'x' })).toBeNull();
    expect(norm.fromHookEvent({ type: 'post_tool_use' })).toBeNull();
    expect(norm.fromHookEvent({ type: 'stop' })).toBeNull();
  });
});
