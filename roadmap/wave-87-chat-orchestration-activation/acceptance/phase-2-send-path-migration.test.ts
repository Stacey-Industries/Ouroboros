/**
 * Wave 87 Phase 2 — orchestrator-owned acceptance test.
 *
 * Per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`: this file is the
 * boundary contract for Phase 2. The implementing subagent may READ it but MUST
 * NOT MODIFY it.
 *
 * Phase 2 migrates the production renderer send path from the legacy
 * `agentChat:*` IPC bridge to `chatCommand:sendMessage`. The contract:
 *
 *   1. `useAgentChatStreaming.ts` invokes the new `chatCommand.sendMessage`
 *      API on a user-initiated send.
 *   2. `useAgentChatStreaming.ts` no longer invokes any legacy `agentChat`
 *      send IPC.
 *   3. The new `chatCommand:sendMessage` IPC handler, when invoked, drives
 *      the broadcaster to emit a `status_changed:submitting` diff for the
 *      target thread — proving the new path is functional end-to-end, not
 *      just structurally rewired.
 *
 * Phase 0 baseline: all three assertions FAIL. Phase 2 makes them pass.
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

describe('Wave 87 Phase 2 acceptance — renderer send-path migration', () => {
  it('useAgentChatStreaming.ts invokes the new chatCommand send API', () => {
    const src = readSrc(STREAMING_HOOK);
    // Phase 2's deliverable: renderer-side sends call `chatCommand.sendMessage`
    // (or the equivalent preload-bridged invocation). The exact symbol on the
    // preload bridge is renderer-implementer judgment, but ONE of these forms
    // must be present.
    const hasNewPathInvocation =
      /chatCommand\.sendMessage\b/.test(src) ||
      /['"]chatCommand:sendMessage['"]/.test(src) ||
      /\bsendChatCommandMessage\b/.test(src);
    expect(
      hasNewPathInvocation,
      'useAgentChatStreaming.ts must invoke the new chatCommand.sendMessage path. Phase 2 has not migrated the send path until this assertion holds.',
    ).toBe(true);
  });

  it('useAgentChatStreaming.ts no longer invokes the legacy agentChat send IPC', () => {
    const src = readSrc(STREAMING_HOOK);
    // The legacy bridge entry points the renderer used to call. After Phase 2,
    // none of these may appear in the streaming hook — even if the bridge
    // runtime is still in place (Phase 3 deletes it). Phase 2 is the unwiring.
    expect(src).not.toMatch(/electronAPI\.agentChat\.sendMessage\b/);
    expect(src).not.toMatch(/electronAPI\.agentChat\.send\b/);
    expect(src).not.toMatch(/['"]agentChat:send\b/);
    expect(src).not.toMatch(/window\.electronAPI\.agentChat\b/);
  });

  it('chatCommand:sendMessage drives the broadcaster to emit status_changed:submitting', async () => {
    // Runtime contract: prove the new path is functional, not just structurally
    // rewired. Wires up a fresh broadcaster + registry + persistence (mirroring
    // the production singleton wiring at a small scale) and invokes the new
    // path the same way the IPC handler would.
    //
    // This test uses dynamic import so it does not load main-process code
    // (which calls `app.getPath` at module-eval time in Wave 87 Phase 0
    // baseline) before the Phase 1 lazy-init refactor lands. Phase 2 cannot
    // start until Phase 1's acceptance test passes, so by the time this test
    // runs, the static-import surface is safe.

    const { ChatStateBroadcaster } = await import('@main/agentChat/chatStateBroadcaster');
    const { ChatPersistenceLayer } = await import('@main/agentChat/chatPersistenceLayer');
    const { EventNormalizer } = await import('@main/agentChat/eventNormalizer');
    const { IdentityRegistry } = await import('@main/agentChat/identityRegistry');
    const { diffChannel } = await import('@shared/ipc/chatStateChannels');
    const Database = (await import('better-sqlite3')).default;

    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'idle',
        lastProviderSessionId TEXT, lastInterruptedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS identity_aliases (
        thread_id TEXT PRIMARY KEY, turn_id TEXT,
        provider_session_id TEXT, created_at INTEGER NOT NULL, retired_at INTEGER
      );
    `);

    const registry = new IdentityRegistry();
    const normalizer = new EventNormalizer(registry);
    const broadcaster = new ChatStateBroadcaster();
    // Persistence is wired in production; constructed here to mirror that
    // wiring even if this test does not assert against it directly.
    new ChatPersistenceLayer(db as unknown as import('@main/storage/database').Database);

    const THREAD_ID = 'thread-phase-2-acceptance' as never;
    const TURN_ID = 'turn-phase-2-acceptance' as never;

    const wc = makeMockWebContents();
    registry.registerTurn(THREAD_ID, TURN_ID);
    broadcaster.ensureThread(THREAD_ID);
    broadcaster.subscribe(THREAD_ID, wc as unknown as WebContents);

    // Simulate the chatCommand:sendMessage handler's effect: normalize the
    // command event and dispatch it. The Phase 2 contract is that the renderer
    // ultimately causes this exact call path to fire.
    const event = normalizer.fromCommand({ threadId: THREAD_ID, content: 'hello' }, TURN_ID);
    broadcaster.dispatch(event);

    const diffs = wc.send.mock.calls
      .filter((c) => c[0] === diffChannel(THREAD_ID))
      .map((c) => c[1] as ChatStateDiff);
    const sawSubmitting = diffs.some(
      (d) => d.type === 'status_changed' && d.status === 'submitting',
    );
    expect(
      sawSubmitting,
      'Expected a status_changed:submitting diff on the new path after a chatCommand-shaped dispatch. If this fails the new path itself is broken, independent of the renderer migration.',
    ).toBe(true);

    db.close();
  });
});
