/**
 * walkingSkeleton.integration.test.ts — Wave 86 Phase 1 cross-module wiring test.
 *
 * Wires the four new modules together (no mocks between them):
 *   IdentityRegistry → EventNormalizer → ChatSessionStateMachine → ChatStateBroadcaster
 *
 * Mocks ONLY the WebContents (the IPC boundary). Synthetic stream-json events
 * stand in for the CLI subprocess output. Asserts:
 *   1. The cross-process channel contract (broadcaster sends to diffChannel/snapshotChannel)
 *   2. State transitions fire in the spec'd order
 *   3. Diff payloads carry the right shape and the per-thread monotonic seq
 *
 * This is the integration boundary unit tests cannot cover — each module passing
 * its own tests doesn't prove the composition is correct. Wave 84's failure mode
 * was exactly this: unit-clean code, broken integration.
 */

import { diffChannel, snapshotChannel } from '@shared/ipc/chatStateChannels';
import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import type { ChatStateDiff, ChatStateSnapshot } from '@shared/types/chatStateDiff';
import Database from 'better-sqlite3';
import type { WebContents } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPersistenceLayer } from './chatPersistenceLayer';
import { ChatStateBroadcaster } from './chatStateBroadcaster';
import { EventNormalizer } from './eventNormalizer';
import { IdentityRegistry } from './identityRegistry';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const THREAD_ID = 'thread-walking-skeleton-1' as ThreadId;
const TURN_ID = 'turn-walking-skeleton-1' as TurnId;
const PROVIDER_SESSION_ID = 'psid-walking-skeleton-1' as ProviderSessionId;

interface MockWebContents {
  send: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
}

function makeMockWebContents(): MockWebContents {
  return {
    send: vi.fn(),
    isDestroyed: () => false,
  };
}

interface WiredSkeleton {
  registry: IdentityRegistry;
  normalizer: EventNormalizer;
  broadcaster: ChatStateBroadcaster;
  wc: MockWebContents;
  unsub: () => void;
  seenPsids: Set<ProviderSessionId>;
}

function wireSkeleton(): WiredSkeleton {
  const registry = new IdentityRegistry();
  const normalizer = new EventNormalizer(registry);
  const broadcaster = new ChatStateBroadcaster();
  const wc = makeMockWebContents();

  registry.registerTurn(THREAD_ID, TURN_ID);
  broadcaster.ensureThread(THREAD_ID);
  const unsub = broadcaster.subscribe(THREAD_ID, wc as unknown as WebContents);

  return { registry, normalizer, broadcaster, wc, unsub, seenPsids: new Set() };
}

// Extract calls to wc.send filtered to the diff channel, preserving order.
function diffsSentTo(wc: MockWebContents): ChatStateDiff[] {
  return wc.send.mock.calls
    .filter((call) => call[0] === diffChannel(THREAD_ID))
    .map((call) => call[1] as ChatStateDiff);
}

function snapshotsSentTo(wc: MockWebContents): ChatStateSnapshot[] {
  return wc.send.mock.calls
    .filter((call) => call[0] === snapshotChannel(THREAD_ID))
    .map((call) => call[1] as ChatStateSnapshot);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Wave 86 walking skeleton — full pipeline integration', () => {
  it('subscribe immediately fans out a snapshot on snapshotChannel(threadId)', () => {
    const { wc } = wireSkeleton();
    const snapshots = snapshotsSentTo(wc);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      threadId: THREAD_ID,
      status: 'idle',
      seq: 0,
    });
  });

  it('full turn lifecycle produces the expected diff sequence on diffChannel(threadId)', () => {
    const { normalizer, broadcaster, registry, wc, seenPsids } = wireSkeleton();

    // 1. User submits a message.
    const submitEvent = normalizer.fromCommand({ threadId: THREAD_ID, content: 'hello' }, TURN_ID);
    broadcaster.dispatch(submitEvent);

    // 2. First stream-json event carries session_id → provider_session_assigned.
    const sysInit = normalizer.fromStreamJson(
      { type: 'system', subtype: 'init', session_id: PROVIDER_SESSION_ID } as never,
      TURN_ID,
      seenPsids,
    );
    expect(sysInit?.type).toBe('provider_session_assigned');
    registry.assignProviderSession(TURN_ID, PROVIDER_SESSION_ID);
    if (sysInit) broadcaster.dispatch(sysInit);

    // 3. assistant event with text → text_delta.
    const textEvent = normalizer.fromStreamJson(
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hi there!' }] },
      } as never,
      TURN_ID,
      seenPsids,
    );
    expect(textEvent?.type).toBe('text_delta');
    if (textEvent) broadcaster.dispatch(textEvent);

    // 4. result event with success → turn_completed.
    const resultEvent = normalizer.fromStreamJson(
      { type: 'result', subtype: 'success', result: 'Hi there!' } as never,
      TURN_ID,
      seenPsids,
    );
    expect(resultEvent?.type).toBe('turn_completed');
    if (resultEvent) broadcaster.dispatch(resultEvent);

    // Assert the diff sequence on the per-thread channel.
    const diffs = diffsSentTo(wc);
    const types = diffs.map((d) => `${d.type}${'status' in d ? `:${d.status}` : ''}`);
    // Phase 3: turn_completed → completing; idle only after message_committed.
    expect(types).toEqual([
      'status_changed:submitting', // from turn_submitted
      'status_changed:streaming', // first text_delta promotes
      'text_appended', // the delta itself
      'status_changed:completing', // turn_completed → completing
      'turn_completed', // the completion diff
      // status_changed:idle removed — Phase 3 requires explicit message_committed
    ]);
  });

  it('per-thread seq is monotonic across diffs', () => {
    const { normalizer, broadcaster, registry, wc, seenPsids } = wireSkeleton();
    broadcaster.dispatch(normalizer.fromCommand({ threadId: THREAD_ID, content: 'hi' }, TURN_ID));
    const sysInit = normalizer.fromStreamJson(
      { type: 'system', subtype: 'init', session_id: PROVIDER_SESSION_ID } as never,
      TURN_ID,
      seenPsids,
    );
    if (sysInit) {
      registry.assignProviderSession(TURN_ID, PROVIDER_SESSION_ID);
      broadcaster.dispatch(sysInit);
    }
    const t1 = normalizer.fromStreamJson(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'a' }] } } as never,
      TURN_ID,
      seenPsids,
    );
    if (t1) broadcaster.dispatch(t1);
    const t2 = normalizer.fromStreamJson(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'b' }] } } as never,
      TURN_ID,
      seenPsids,
    );
    if (t2) broadcaster.dispatch(t2);

    const seqs = diffsSentTo(wc).map((d) => d.seq);
    for (let i = 1; i < seqs.length; i += 1) {
      // eslint-disable-next-line security/detect-object-injection
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it('text_appended diff payload carries the actual delta string', () => {
    const { normalizer, broadcaster, registry, wc, seenPsids } = wireSkeleton();
    broadcaster.dispatch(normalizer.fromCommand({ threadId: THREAD_ID, content: 'hi' }, TURN_ID));
    const sysInit = normalizer.fromStreamJson(
      { type: 'system', subtype: 'init', session_id: PROVIDER_SESSION_ID } as never,
      TURN_ID,
      seenPsids,
    );
    if (sysInit) {
      registry.assignProviderSession(TURN_ID, PROVIDER_SESSION_ID);
      broadcaster.dispatch(sysInit);
    }
    const textEvent = normalizer.fromStreamJson(
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'streaming-payload' }] },
      } as never,
      TURN_ID,
      seenPsids,
    );
    if (textEvent) broadcaster.dispatch(textEvent);

    const textDiff = diffsSentTo(wc).find((d) => d.type === 'text_appended');
    expect(textDiff).toBeDefined();
    expect((textDiff as Extract<ChatStateDiff, { type: 'text_appended' }>).delta).toBe(
      'streaming-payload',
    );
  });

  it('stream-json event with unknown turnId throws ChatStateError (no inferSessionId)', () => {
    const { normalizer, seenPsids } = wireSkeleton();
    const unknownTurn = 'turn-not-registered' as TurnId;
    expect(() =>
      normalizer.fromStreamJson(
        { type: 'assistant', message: { content: [{ type: 'text', text: 'x' }] } } as never,
        unknownTurn,
        seenPsids,
      ),
    ).toThrow(/unknown.*turn/i);
  });

  it('unsubscribe stops further diff fan-out to that WebContents', () => {
    const { normalizer, broadcaster, registry, wc, unsub, seenPsids } = wireSkeleton();
    broadcaster.dispatch(normalizer.fromCommand({ threadId: THREAD_ID, content: 'hi' }, TURN_ID));
    const sysInit = normalizer.fromStreamJson(
      { type: 'system', subtype: 'init', session_id: PROVIDER_SESSION_ID } as never,
      TURN_ID,
      seenPsids,
    );
    if (sysInit) {
      registry.assignProviderSession(TURN_ID, PROVIDER_SESSION_ID);
      broadcaster.dispatch(sysInit);
    }

    const countBefore = wc.send.mock.calls.length;
    unsub();

    const textEvent = normalizer.fromStreamJson(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'after' }] } } as never,
      TURN_ID,
      seenPsids,
    );
    if (textEvent) broadcaster.dispatch(textEvent);

    // No new sends should have happened after unsubscribe.
    expect(wc.send.mock.calls.length).toBe(countBefore);
  });

  it('Phase 3: tool-call lifecycle — tool_call_started → input_delta → completed → result → turn_completed → message_committed → idle', () => {
    const { normalizer, broadcaster, registry, wc, seenPsids } = wireSkeleton();
    const TOOL_ID = 'tool-use-ws-1' as import('@shared/types/canonicalChatEvent').ToolUseId;

    // 1. Submit turn.
    broadcaster.dispatch(
      normalizer.fromCommand({ threadId: THREAD_ID, content: 'run bash' }, TURN_ID),
    );

    // 2. Provider session assigned.
    const sysInit = normalizer.fromStreamJson(
      { type: 'system', subtype: 'init', session_id: PROVIDER_SESSION_ID } as never,
      TURN_ID,
      seenPsids,
    );
    if (sysInit) {
      registry.assignProviderSession(TURN_ID, PROVIDER_SESSION_ID);
      broadcaster.dispatch(sysInit);
    }

    // 3. Text delta — enters streaming.
    const textBefore = normalizer.fromStreamJson(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Running...' }] } } as never,
      TURN_ID,
      seenPsids,
    );
    if (textBefore) broadcaster.dispatch(textBefore);

    // 4. Tool call started — streaming → tool_running.
    const toolStarted = normalizer.fromStreamJson(
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: TOOL_ID, name: 'Bash', input: {} }] },
      } as never,
      TURN_ID,
      seenPsids,
    );
    expect(toolStarted?.type).toBe('tool_call_started');
    if (toolStarted) broadcaster.dispatch(toolStarted);
    expect(broadcaster.snapshot(THREAD_ID).status).toBe('tool_running');

    // 5. Tool result observed (user event with tool_result block).
    const toolResultRaw = normalizer.fromStreamJson(
      {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: TOOL_ID, content: 'exit 0' }] },
      } as never,
      TURN_ID,
      seenPsids,
    );
    const toolResults = Array.isArray(toolResultRaw)
      ? toolResultRaw
      : toolResultRaw
        ? [toolResultRaw]
        : [];
    expect(toolResults.length).toBeGreaterThan(0);
    expect(toolResults[0].type).toBe('tool_result_observed');
    for (const r of toolResults) broadcaster.dispatch(r);

    // 6. Turn completed.
    const completed = normalizer.fromStreamJson(
      { type: 'result', subtype: 'success', result: 'Done' } as never,
      TURN_ID,
      seenPsids,
    );
    expect(completed?.type).toBe('turn_completed');
    if (completed) broadcaster.dispatch(completed);
    expect(broadcaster.snapshot(THREAD_ID).status).toBe('completing');

    // 7. message_committed drives completing → idle.
    broadcaster.dispatch({
      type: 'message_committed' as const,
      threadId: THREAD_ID,
      turnId: TURN_ID,
      messageId: 'msg-ws-1' as import('@shared/types/canonicalChatEvent').MessageId,
      ts: Date.now(),
      seq: 0,
    });
    expect(broadcaster.snapshot(THREAD_ID).status).toBe('idle');

    // Assert status sequence visible on the wire.
    const diffs = diffsSentTo(wc);
    const statuses = diffs
      .filter(
        (d): d is Extract<typeof d, { type: 'status_changed' }> => d.type === 'status_changed',
      )
      .map((d) => d.status);
    expect(statuses).toContain('submitting');
    expect(statuses).toContain('streaming');
    expect(statuses).toContain('tool_running');
    expect(statuses).toContain('completing');
    expect(statuses).toContain('idle');
  });

  it('broadcaster fans-out to multiple subscribers on the same thread', () => {
    const { broadcaster, normalizer, registry, seenPsids } = wireSkeleton();
    // wireSkeleton already subscribed one wc; add a second.
    const wc2 = makeMockWebContents();
    broadcaster.subscribe(THREAD_ID, wc2 as unknown as WebContents);

    broadcaster.dispatch(normalizer.fromCommand({ threadId: THREAD_ID, content: 'hi' }, TURN_ID));
    const sysInit = normalizer.fromStreamJson(
      { type: 'system', subtype: 'init', session_id: PROVIDER_SESSION_ID } as never,
      TURN_ID,
      seenPsids,
    );
    if (sysInit) {
      registry.assignProviderSession(TURN_ID, PROVIDER_SESSION_ID);
      broadcaster.dispatch(sysInit);
    }

    // wc2 should have received the snapshot at subscribe time plus the submitting diff.
    expect(wc2.send.mock.calls.length).toBeGreaterThan(0);
    const wc2Diffs = wc2.send.mock.calls
      .filter((c) => c[0] === diffChannel(THREAD_ID))
      .map((c) => c[1] as ChatStateDiff);
    expect(wc2Diffs.some((d) => d.type === 'status_changed' && d.status === 'submitting')).toBe(
      true,
    );
  });
});

// ─── Wave 86 Phase 2: persistence integration ─────────────────────────────────

const PERSIST_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'idle',
    lastProviderSessionId TEXT, lastInterruptedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT NOT NULL, threadId TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL DEFAULT 0, canonical_event_log TEXT,
    PRIMARY KEY (id, threadId)
  );
  CREATE TABLE IF NOT EXISTS identity_aliases (
    thread_id TEXT PRIMARY KEY, turn_id TEXT,
    provider_session_id TEXT, created_at INTEGER NOT NULL, retired_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_identity_aliases_psid
    ON identity_aliases(provider_session_id);
`;

describe('Wave 86 Phase 2 — persistence integration across full turn lifecycle', () => {
  const P_THREAD = 'thread-persist-integration' as ThreadId;
  const P_TURN = 'turn-persist-integration' as TurnId;
  const P_PSID = 'psid-persist-integration' as ProviderSessionId;

  let db: InstanceType<typeof Database>;
  let persistence: ChatPersistenceLayer;
  let registry: IdentityRegistry;
  let normalizer: EventNormalizer;
  let broadcaster: ChatStateBroadcaster;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(PERSIST_SCHEMA_SQL);
    // Seed a thread row so UPDATE statements targeting it hit real data.
    db.prepare(
      `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status)
       VALUES (?, '', 1, 1, 'Persist test', 'idle')`,
    ).run(P_THREAD);

    persistence = new ChatPersistenceLayer(db as unknown as import('../storage/database').Database);
    registry = new IdentityRegistry();
    normalizer = new EventNormalizer(registry);
    broadcaster = new ChatStateBroadcaster();
  });

  afterEach(() => {
    db.close();
  });

  it('after full turn lifecycle loadAliases returns entry with PSID and retiredAt set', () => {
    // 1. Register turn + persist alias (mirrors chatStateNewPath wiring).
    registry.registerTurn(P_THREAD, P_TURN);
    persistence.insertAlias({ threadId: P_THREAD, turnId: P_TURN, createdAt: 1000 });

    broadcaster.ensureThread(P_THREAD);
    const submitEvent = normalizer.fromCommand({ threadId: P_THREAD, content: 'hello' }, P_TURN);
    broadcaster.dispatch(submitEvent);

    // 2. PSID arrives via stream-json.
    const seenPsids = new Set<ProviderSessionId>();
    const sysInit = normalizer.fromStreamJson(
      { type: 'system', subtype: 'init', session_id: P_PSID } as never,
      P_TURN,
      seenPsids,
    );
    if (sysInit?.type === 'provider_session_assigned') {
      registry.assignProviderSession(P_TURN, sysInit.providerSessionId);
      persistence.assignProviderSessionToAlias(P_TURN, sysInit.providerSessionId);
      persistence.setLastProviderSession(P_THREAD, sysInit.providerSessionId);
    }
    broadcaster.dispatch(sysInit!);

    // 3. Turn completes — retire alias.
    registry.retireTurn(P_TURN);
    const retiredAt = Date.now();
    persistence.retireAlias(P_TURN, retiredAt);

    // Assert persistence state.
    const aliases = persistence.loadAliases();
    expect(aliases).toHaveLength(1);
    expect(aliases[0].threadId).toBe(P_THREAD);
    expect(aliases[0].turnId).toBe(P_TURN);
    expect(aliases[0].providerSessionId).toBe(P_PSID);
    expect(aliases[0].retiredAt).toBe(retiredAt);

    // Assert threads.lastProviderSessionId populated.
    const threadRow = db
      .prepare('SELECT lastProviderSessionId FROM threads WHERE id = ?')
      .get(P_THREAD) as { lastProviderSessionId: string | null };
    expect(threadRow.lastProviderSessionId).toBe(P_PSID);
  });

  it('rebuildFromSQLite restores the registry after a turn lifecycle', () => {
    registry.registerTurn(P_THREAD, P_TURN);
    persistence.insertAlias({ threadId: P_THREAD, turnId: P_TURN, createdAt: 1000 });
    registry.assignProviderSession(P_TURN, P_PSID);
    persistence.assignProviderSessionToAlias(P_TURN, P_PSID);

    // Simulate restart: fresh registry rebuilt from SQLite.
    const registry2 = new IdentityRegistry();
    registry2.rebuildFromSQLite(persistence);

    expect(registry2.getActiveTurn(P_THREAD)).toBe(P_TURN);
    expect(registry2.getProviderSession(P_THREAD)).toBe(P_PSID);
    expect(registry2.threadIdForProviderSession(P_PSID)).toBe(P_THREAD);
  });
});
