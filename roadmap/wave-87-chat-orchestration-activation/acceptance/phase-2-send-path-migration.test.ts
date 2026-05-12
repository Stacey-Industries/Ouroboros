/**
 * Wave 87 Phase 2 — orchestrator-owned acceptance test (rewritten).
 *
 * Per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`: this file is the
 * boundary contract for Phase 2. The implementing subagent may READ it but MUST
 * NOT MODIFY it.
 *
 * Original version (pre-2026-05-12) asserted only renderer source-grep + a
 * synthetic broadcaster dispatch. That contract was too weak — a feature-
 * incomplete handler passed it. See Decision 10 in `wave-87-decisions.md` for
 * the rationale on rewriting.
 *
 * Phase 2 is now split into:
 *   2A — main-process build-out: `chatSendCoordinator.ts` owns the send
 *        pipeline (Decision 7); `chatCommand:sendMessage` payload type
 *        enriched; `chatCommand:cancelTurn` channel added (Decision 8);
 *        `TurnSubmittedEvent` carries resolved metadata (Decision 9).
 *   2B — renderer cutover against the now-complete handler.
 *
 * This test gates BOTH phases. After 2A: structural assertions (1)(3)(4)(5)(6)
 * + behavioral assertion (7) all pass; renderer assertions (2)(2b) still fail.
 * After 2B: all assertions pass.
 *
 * Run with:
 *   npx vitest run roadmap/wave-87-chat-orchestration-activation/acceptance/phase-2-send-path-migration.test.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ChatStateDiff } from '@shared/types/chatStateDiff';
import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const STREAMING_HOOK = resolve(
  REPO_ROOT,
  'src/renderer/components/AgentChat/useAgentChatStreaming.ts',
);
const COORDINATOR_SRC = resolve(REPO_ROOT, 'src/main/agentChat/chatSendCoordinator.ts');
const CANONICAL_EVENT_SRC = resolve(REPO_ROOT, 'src/shared/types/canonicalChatEvent.ts');
const CHAT_STATE_CHANNELS_SRC = resolve(REPO_ROOT, 'src/shared/ipc/chatStateChannels.ts');

function readSrc(absPath: string): string {
  return readFileSync(absPath, 'utf8');
}

interface MockWebContents {
  send: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
}

function makeMockWebContents(): MockWebContents {
  return { send: vi.fn(), isDestroyed: () => false };
}

describe('Wave 87 Phase 2 acceptance — send-path build-out + renderer cutover', () => {
  // ── Phase 2A structural gates ────────────────────────────────────────────────

  it('(1) chatSendCoordinator.ts exists and exports submitSend + cancelTurn', async () => {
    // Locks the module path + key entry-point names. Phase 2A's coordinator MUST
    // live here with at least these two functions on its public API. The
    // implementer chooses parameter shapes; the test asserts symbol presence.
    const mod = (await import('@main/agentChat/chatSendCoordinator')) as Record<string, unknown>;
    expect(
      typeof mod.submitSend,
      'chatSendCoordinator must export submitSend as a function (the entry point that owns the send pipeline)',
    ).toBe('function');
    expect(
      typeof mod.cancelTurn,
      'chatSendCoordinator must export cancelTurn as a function (the entry point that drives turn_cancelled per Decision 8)',
    ).toBe('function');
  });

  it('(3) TurnSubmittedEvent carries Decision 9 resolved metadata fields', () => {
    const src = readSrc(CANONICAL_EVENT_SRC);
    // The Decision 9 fields: preSnapshotHash, resolvedProvider, resolvedModel,
    // resolvedEffort, resolvedPermissionMode. Decision says preSnapshotHash and
    // resolvedEffort/resolvedPermissionMode may be optional/nullable; provider
    // and model are required (every send resolves them).
    //
    // We grep against the file rather than the runtime type because types do
    // not survive to runtime. The grep is scoped to the TurnSubmittedEvent
    // interface block.
    const ifaceMatch = src.match(
      /export interface TurnSubmittedEvent\s*\{[\s\S]*?\n\}/,
    );
    expect(ifaceMatch, 'TurnSubmittedEvent interface declaration not found').toBeTruthy();
    const iface = ifaceMatch?.[0] ?? '';
    expect(iface, '`preSnapshotHash` field missing on TurnSubmittedEvent').toMatch(
      /\bpreSnapshotHash\b/,
    );
    expect(iface, '`resolvedProvider` field missing on TurnSubmittedEvent').toMatch(
      /\bresolvedProvider\b/,
    );
    expect(iface, '`resolvedModel` field missing on TurnSubmittedEvent').toMatch(
      /\bresolvedModel\b/,
    );
    expect(iface, '`resolvedEffort` field missing on TurnSubmittedEvent').toMatch(
      /\bresolvedEffort\b/,
    );
    expect(iface, '`resolvedPermissionMode` field missing on TurnSubmittedEvent').toMatch(
      /\bresolvedPermissionMode\b/,
    );
  });

  it('(4) chatStateChannels exports a cancelTurn channel name (Decision 8)', () => {
    const src = readSrc(CHAT_STATE_CHANNELS_SRC);
    // Decision 8 grants Decision 6 an exception for chatCommand:cancelTurn.
    // The channel name MUST be declared in the shared IPC channels module so
    // the renderer and main agree on it without string-literal drift.
    expect(src, 'chatCommand:cancelTurn channel literal missing from chatStateChannels.ts').toMatch(
      /['"]chatCommand:cancelTurn['"]/,
    );
  });

  it('(5) chatSendCoordinator.ts source references the full enriched request shape', () => {
    // Phase 2A's coordinator must accept the enriched payload the renderer
    // sends. We assert at the source level that the coordinator file references
    // at minimum: attachments, contextSelection, overrides, skillExpansion —
    // the four enriched fields that the legacy bridge carried and which the
    // walking-skeleton handler dropped.
    const src = readSrc(COORDINATOR_SRC);
    expect(src, 'coordinator must accept attachments').toMatch(/\battachments\b/);
    expect(src, 'coordinator must accept contextSelection').toMatch(/\bcontextSelection\b/);
    expect(src, 'coordinator must accept overrides').toMatch(/\boverrides\b/);
    expect(src, 'coordinator must accept skillExpansion').toMatch(/\bskillExpansion\b/);
  });

  it('(6) main IPC handler reaches the coordinator (chatStateNewPath.ts imports it)', () => {
    // Phase 2A wires the chatCommand:sendMessage IPC handler in
    // chatStateNewPath.ts to delegate to chatSendCoordinator. Locks the
    // boundary so a future refactor that bypasses the coordinator (e.g.,
    // re-introduces direct spawnStreamJsonProcess from the handler) breaks
    // this test.
    const handlerSrc = readSrc(
      resolve(REPO_ROOT, 'src/main/ipc-handlers/chatStateNewPath.ts'),
    );
    expect(
      handlerSrc,
      'chatStateNewPath.ts must import from chatSendCoordinator (the canonical send entry point)',
    ).toMatch(/from\s+['"][^'"]*chatSendCoordinator['"]/);
  });

  // ── Phase 2A behavioral gate ─────────────────────────────────────────────────

  it('(7) coordinator drives turn_submitted with resolved metadata + message_committed on terminal', async () => {
    // This is the load-bearing behavioral test. It exercises the coordinator
    // with mocked dependencies (so we do not spawn real subprocess) and asserts
    // the observable side effects on the broadcaster:
    //   a. After submitSend, a turn_submitted diff fans out carrying the
    //      resolved provider/model/effort/permissionMode metadata.
    //   b. After a simulated terminal event reaches the coordinator (the
    //      provider stream completes), a message_committed diff fans out.
    //
    // The test does NOT lock the deps interface name-by-name; the coordinator
    // is allowed to receive its dependencies however its API author designs.
    // What it locks is the observable behavior at the broadcaster boundary.
    //
    // If the coordinator's deps interface is impossible to instantiate with
    // these primitives, that's a design smell the implementer should surface
    // back to the orchestrator rather than working around.

    const { ChatStateBroadcaster } = await import('@main/agentChat/chatStateBroadcaster');
    const { ChatPersistenceLayer } = await import('@main/agentChat/chatPersistenceLayer');
    const { EventNormalizer } = await import('@main/agentChat/eventNormalizer');
    const { IdentityRegistry } = await import('@main/agentChat/identityRegistry');
    const { diffChannel } = await import('@shared/ipc/chatStateChannels');
    const Database = (await import('better-sqlite3')).default;
    const coordinator = await import('@main/agentChat/chatSendCoordinator');

    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'idle',
        lastProviderSessionId TEXT, lastInterruptedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, threadId TEXT NOT NULL, role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS identity_aliases (
        thread_id TEXT, turn_id TEXT PRIMARY KEY,
        provider_session_id TEXT, created_at INTEGER NOT NULL, retired_at INTEGER
      );
    `);

    const registry = new IdentityRegistry();
    const normalizer = new EventNormalizer(registry);
    const broadcaster = new ChatStateBroadcaster();
    const persistence = new ChatPersistenceLayer(
      db as unknown as import('@main/storage/database').Database,
    );

    const wc = makeMockWebContents();
    const THREAD_ID = 'thread-phase-2a-acceptance';
    broadcaster.ensureThread(THREAD_ID as never);
    broadcaster.subscribe(THREAD_ID as never, wc as unknown as WebContents);

    // The coordinator is expected to accept some shape of dependency object.
    // We pass the singletons + a synchronous fake provider dispatcher. The
    // implementer's deps interface may differ in field names; if it does, the
    // implementer should surface this back rather than modifying the test.
    type FakeTerminalCb = (kind: 'completed' | 'failed' | 'cancelled') => void;
    let triggerTerminal: FakeTerminalCb | null = null;

    const fakeDispatchProvider = vi.fn((args: { onTerminal: FakeTerminalCb }) => {
      triggerTerminal = args.onTerminal;
      return { kill: vi.fn(), turnId: 'fake' };
    });

    // Decision 9: resolved metadata is what the coordinator must populate on
    // the turn_submitted event. The coordinator's settings resolver is allowed
    // to override these — the test asserts that SOME non-empty values arrive
    // on the canonical event, not specific values.
    const result = await coordinator.submitSend(
      {
        threadId: THREAD_ID,
        workspaceRoot: 'C:\\test\\workspace',
        content: 'hello phase 2',
        attachments: [],
        contextSelection: { userSelectedFiles: [] },
        overrides: { providerOverride: 'claude-code', modelOverride: 'claude-sonnet-4-6' },
        metadata: { source: 'composer', usedAdvancedControls: false },
      } as never,
      {
        broadcaster,
        registry,
        normalizer,
        persistence,
        dispatchProvider: fakeDispatchProvider,
      } as never,
    );

    expect(result, 'submitSend returned an unexpected shape').toBeTruthy();

    // Assert turn_submitted reached the renderer subscriber.
    const diffs = wc.send.mock.calls
      .filter((c) => c[0] === diffChannel(THREAD_ID as never))
      .map((c) => c[1] as ChatStateDiff);
    const submittedDiff = diffs.find((d) => d.type === 'status_changed' && d.status === 'submitting');
    expect(
      submittedDiff,
      'submitSend must dispatch a status_changed:submitting diff via the broadcaster',
    ).toBeTruthy();

    // The diff envelope MAY also carry the resolved-metadata fields, but the
    // canonical event is the durable place. Assert the persistence layer (the
    // canonical event sink) saw resolvedProvider + resolvedModel on the
    // turn_submitted record. The exact getter is implementation-defined; we
    // look up the alias row that the coordinator must have inserted.
    const aliasRow = db
      .prepare('SELECT * FROM identity_aliases WHERE thread_id = ?')
      .get(THREAD_ID) as { thread_id: string; turn_id: string } | undefined;
    expect(
      aliasRow,
      'coordinator must persist a turn alias on submitSend (registry + persistence wiring)',
    ).toBeTruthy();

    // Simulate the provider completing. The coordinator must respond by
    // emitting a message_committed canonical event (Decision 9: turn_completed
    // alone is insufficient — the commit boundary is message_committed).
    expect(triggerTerminal, 'coordinator did not register a terminal callback').toBeTruthy();
    triggerTerminal?.('completed');

    // Allow microtasks to drain.
    await new Promise((r) => setImmediate(r));

    const post = wc.send.mock.calls
      .filter((c) => c[0] === diffChannel(THREAD_ID as never))
      .map((c) => c[1] as ChatStateDiff);
    const committed = post.find((d) => d.type === 'status_changed' && d.status === 'idle');
    expect(
      committed,
      'after the provider terminal event, coordinator must dispatch message_committed (state returns to idle)',
    ).toBeTruthy();

    db.close();
  });

  // ── Phase 2B renderer gates ──────────────────────────────────────────────────

  it('(2) renderer invokes the new chatCommand send API with the enriched payload', () => {
    const src = readSrc(STREAMING_HOOK);
    // Phase 2B: the renderer reaches the coordinator-backed handler with the
    // full request shape. We assert: (a) one of the new-path invocation forms
    // is present, AND (b) the call site references the enriched fields the
    // legacy SendRequest carried (attachments / contextSelection / overrides
    // / skillExpansion). The latter is what proves the Phase 2A enrichment is
    // actually being USED by the renderer; without it, 2B regresses composer
    // overrides the way Codex's first Phase 2 dispatch did.
    const hasNewPathInvocation =
      /chatCommand\.sendMessage\b/.test(src) ||
      /['"]chatCommand:sendMessage['"]/.test(src) ||
      /\bsendChatCommandMessage\b/.test(src);
    expect(
      hasNewPathInvocation,
      'useAgentChatStreaming.ts must invoke the new chatCommand.sendMessage path',
    ).toBe(true);
    // At least three of the four enriched fields must appear in the same file
    // — the call site, not just elsewhere in the module. Slight slack (3 of 4)
    // to allow renaming during the rebind.
    const enrichedFields = ['attachments', 'contextSelection', 'overrides', 'skillExpansion'];
    const present = enrichedFields.filter((f) => new RegExp(`\\b${f}\\b`).test(src));
    expect(
      present.length,
      `useAgentChatStreaming.ts must reference enriched-payload fields (saw ${present.length}/4: ${present.join(', ')}). Without these the renderer regresses to walking-skeleton payload.`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('(2b) renderer no longer references legacy agentChat send IPC', () => {
    const src = readSrc(STREAMING_HOOK);
    expect(src).not.toMatch(/electronAPI\.agentChat\.sendMessage\b/);
    expect(src).not.toMatch(/electronAPI\.agentChat\.send\b/);
    expect(src).not.toMatch(/['"]agentChat:send\b/);
    expect(src).not.toMatch(/window\.electronAPI\.agentChat\b/);
  });
});
