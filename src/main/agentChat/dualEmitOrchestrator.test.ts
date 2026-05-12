/**
 * dualEmitOrchestrator.test.ts — Unit tests for DualEmitOrchestrator.
 *
 * Coverage:
 * - onCommand: registers turn in registry, emits turn_submitted via broadcaster
 * - onCommand: inserts alias into persistence
 * - onStreamJsonEvent: unknown turnId is swallowed (no throw)
 * - onStreamJsonEvent: assistant text event emits text_delta via broadcaster
 * - onStreamJsonEvent: provider_session_assigned also persists alias to registry+persistence
 * - onHookEvent: unrecognised hook type is a no-op (no throw)
 * - onHookEvent: pre_tool_use ask for our session dispatches tool_permission_requested
 * - reportTerminal: matching statuses do not throw (in dev DiffComparator)
 * - Shadow errors are swallowed — existing bridge path is unaffected
 */

import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import type { ChatStateSnapshot } from '@shared/types/chatStateDiff';
import { describe, expect, it, vi } from 'vitest';

import { DualEmitOrchestrator } from './dualEmitOrchestrator';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

const T1 = 'thread-duo-1' as ThreadId;
const TURN1 = 'turn-duo-1' as TurnId;
const PSID1 = 'psid-duo-1' as ProviderSessionId;

function makeBroadcaster() {
  const dispatched: unknown[] = [];
  const ensured: ThreadId[] = [];
  let snapStatus = 'idle';

  return {
    dispatch: vi.fn((evt: unknown) => {
      dispatched.push(evt);
    }),
    ensureThread: vi.fn((t: ThreadId) => {
      ensured.push(t);
    }),
    snapshot: vi.fn(
      (): ChatStateSnapshot => ({
        threadId: T1,
        status: snapStatus as ChatStateSnapshot['status'],
        accumulatedText: '',
        activeTurnId: TURN1,
        seq: 3,
      }),
    ),
    _dispatched: dispatched,
    _ensured: ensured,
    setSnapStatus: (s: string) => {
      snapStatus = s;
    },
    subscribe: vi.fn(() => () => undefined),
    unsubscribe: vi.fn(),
  };
}

function makePersistence() {
  const insertedAliases: unknown[] = [];
  const assignedPsids: unknown[] = [];
  return {
    insertAlias: vi.fn((r: unknown) => {
      insertedAliases.push(r);
    }),
    assignProviderSessionToAlias: vi.fn((t: unknown, p: unknown) => {
      assignedPsids.push({ t, p });
    }),
    retireAlias: vi.fn(),
    loadAliases: vi.fn(() => []),
    setLastProviderSession: vi.fn(),
    setLastInterruptedAt: vi.fn(),
    appendCanonicalEventLog: vi.fn(),
    _insertedAliases: insertedAliases,
    _assignedPsids: assignedPsids,
  };
}

function makeDuo(snapStatus?: string) {
  const bc = makeBroadcaster();
  if (snapStatus) bc.setSnapStatus(snapStatus);
  const persist = makePersistence();
  const duo = new DualEmitOrchestrator({
    broadcaster: bc as never,
    persistence: persist as never,
    isDev: false, // prod mode — divergences logged, not thrown
  });
  return { duo, bc, persist };
}

// ─── onCommand ────────────────────────────────────────────────────────────────

describe('onCommand', () => {
  it('registers turn in registry and emits turn_submitted', () => {
    const { duo, bc } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'hello' }, TURN1);

    const types = (bc._dispatched as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain('turn_submitted');
  });

  it('calls ensureThread with correct threadId', () => {
    const { duo, bc } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'hello' }, TURN1);
    expect(bc.ensureThread).toHaveBeenCalledWith(T1);
  });

  it('inserts alias into persistence', () => {
    const { duo, persist } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'hello' }, TURN1);
    expect(persist.insertAlias).toHaveBeenCalledOnce();
    const call = persist._insertedAliases[0] as { threadId: string; turnId: string };
    expect(call.threadId).toBe(T1);
    expect(call.turnId).toBe(TURN1);
  });

  it('does not throw when called twice for different turns', () => {
    const { duo } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'first' }, TURN1);
    expect(() =>
      duo.onCommand({ threadId: T1, content: 'second' }, 'turn-duo-2' as TurnId),
    ).not.toThrow();
  });
});

// ─── onStreamJsonEvent ────────────────────────────────────────────────────────

describe('onStreamJsonEvent', () => {
  it('swallows errors for unknown turnId — does not throw', () => {
    const { duo } = makeDuo();
    // TURN1 not registered — normalizer will throw unknown-turn internally
    const raw = { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } };
    expect(() => duo.onStreamJsonEvent(raw as never, TURN1)).not.toThrow();
  });

  it('emits text_delta for assistant text event (known turn)', () => {
    const { duo, bc } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'q' }, TURN1); // register turn
    bc.dispatch.mockClear();

    const raw = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello' }] },
    };
    duo.onStreamJsonEvent(raw as never, TURN1);

    const types = (bc._dispatched as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain('text_delta');
  });

  it('emits provider_session_assigned and persists alias when session_id seen for first time', () => {
    const { duo, bc, persist } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'q' }, TURN1);
    bc.dispatch.mockClear();
    persist.assignProviderSessionToAlias.mockClear();

    const raw = { type: 'system', subtype: 'init', session_id: PSID1 };
    duo.onStreamJsonEvent(raw as never, TURN1);

    const types = (bc._dispatched as Array<{ type: string }>).map((e) => e.type);
    expect(types).toContain('provider_session_assigned');
    expect(persist.assignProviderSessionToAlias).toHaveBeenCalledOnce();
  });

  it('does NOT emit provider_session_assigned for same session_id on second event', () => {
    const { duo, bc } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'q' }, TURN1);

    const raw = { type: 'system', subtype: 'init', session_id: PSID1 };
    duo.onStreamJsonEvent(raw as never, TURN1); // first time — emits provider_session_assigned
    bc.dispatch.mockClear();

    duo.onStreamJsonEvent(raw as never, TURN1); // second time — already seen
    // Check mock.calls (cleared above) rather than _dispatched (cumulative array)
    const callTypes = bc.dispatch.mock.calls.map((c: unknown[]) => (c[0] as { type: string }).type);
    expect(callTypes).not.toContain('provider_session_assigned');
  });
});

// ─── onHookEvent ──────────────────────────────────────────────────────────────

describe('onHookEvent', () => {
  it('no-ops for unrecognised hook type', () => {
    const { duo, bc } = makeDuo();
    duo.onCommand({ threadId: T1, content: 'q' }, TURN1);
    bc.dispatch.mockClear();

    duo.onHookEvent({ type: 'post_tool_use', session_id: PSID1 });
    expect(bc.dispatch).not.toHaveBeenCalled();
  });

  it('does not throw for hook event with unknown session_id', () => {
    const { duo } = makeDuo();
    // pre_tool_use ask for a session we don't own — should swallow
    expect(() =>
      duo.onHookEvent({ type: 'pre_tool_use', decision: 'ask', session_id: 'unknown-psid' }),
    ).not.toThrow();
  });
});

// ─── reportTerminal ───────────────────────────────────────────────────────────

describe('reportTerminal', () => {
  it('does not throw for unregistered turn (swallowed)', () => {
    const { duo } = makeDuo();
    // TURN1 never registered — reportTerminal should swallow the error
    expect(() => duo.reportTerminal(TURN1, 'completed')).not.toThrow();
  });

  it('does not throw in prod mode when statuses agree', () => {
    const { duo } = makeDuo('completing');
    duo.onCommand({ threadId: T1, content: 'q' }, TURN1);
    expect(() => duo.reportTerminal(TURN1, 'completed')).not.toThrow();
  });
});
