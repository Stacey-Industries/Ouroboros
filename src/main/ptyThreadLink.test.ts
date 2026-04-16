/**
 * ptyThreadLink.test.ts — Wave 21 Phase G
 *
 * Unit tests for linkSessionToThread / getLinkedThread / getLinkedSessionIds.
 * We import from ptyThreadLink directly; sessions map is mocked via the
 * pty module stub below so we never touch node-pty.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Stub the sessions map exported by pty.ts ─────────────────────────────────
//
// ptyThreadLink imports `sessions` from './pty'.  We intercept that import so
// the test never loads node-pty (a native addon that won't run under system Node).
// `vi.hoisted` runs before the module mock factory so the Map reference is live.

const { stubSessions } = vi.hoisted(() => ({
  stubSessions: new Map<string, { id: string; threadId?: string; process: unknown; cwd: string; shell: string }>(),
}));

vi.mock('./pty', () => ({ sessions: stubSessions }));

// Import AFTER the mock is registered so the module gets our stub map.
import {
  getLinkedSessionIds,
  getLinkedThread,
  linkSessionToThread,
} from './ptyThreadLink';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addSession(id: string, threadId?: string): void {
  stubSessions.set(id, { id, process: {}, cwd: '/tmp', shell: 'bash', threadId });
}

beforeEach(() => stubSessions.clear());
afterEach(() => vi.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('linkSessionToThread', () => {
  it('links a session to a thread and returns success', () => {
    addSession('sess-1');
    const result = linkSessionToThread('sess-1', 'thread-a');
    expect(result).toEqual({ success: true });
    expect(stubSessions.get('sess-1')?.threadId).toBe('thread-a');
  });

  it('returns failure for unknown session', () => {
    const result = linkSessionToThread('unknown', 'thread-x');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown/);
  });

  it('is idempotent when called twice with the same threadId', () => {
    addSession('sess-2');
    linkSessionToThread('sess-2', 'thread-b');
    const result = linkSessionToThread('sess-2', 'thread-b');
    expect(result.success).toBe(true);
    expect(stubSessions.get('sess-2')?.threadId).toBe('thread-b');
  });

  it('overwrites an existing threadId when called with a new one', () => {
    addSession('sess-3', 'old-thread');
    linkSessionToThread('sess-3', 'new-thread');
    expect(stubSessions.get('sess-3')?.threadId).toBe('new-thread');
  });
});

describe('getLinkedThread', () => {
  it('returns the threadId for a linked session', () => {
    addSession('sess-4', 'thread-c');
    const result = getLinkedThread('sess-4');
    expect(result).toEqual({ success: true, threadId: 'thread-c' });
  });

  it('returns null threadId for an unlinked session', () => {
    addSession('sess-5');
    const result = getLinkedThread('sess-5');
    expect(result).toEqual({ success: true, threadId: null });
  });

  it('returns failure for an unknown session', () => {
    const result = getLinkedThread('no-such-sess');
    expect(result.success).toBe(false);
    expect(result.threadId).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe('getLinkedSessionIds', () => {
  it('returns IDs of all sessions linked to the given thread', () => {
    addSession('a', 'thread-d');
    addSession('b', 'thread-d');
    addSession('c', 'thread-e');
    const ids = getLinkedSessionIds('thread-d');
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('returns empty array when no sessions match', () => {
    addSession('x', 'thread-f');
    expect(getLinkedSessionIds('thread-none')).toEqual([]);
  });

  it('excludes exited (removed) sessions', () => {
    addSession('alive', 'thread-g');
    addSession('dead', 'thread-g');
    stubSessions.delete('dead');
    expect(getLinkedSessionIds('thread-g')).toEqual(['alive']);
  });
});
