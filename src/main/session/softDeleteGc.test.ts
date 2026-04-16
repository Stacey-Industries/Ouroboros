/**
 * softDeleteGc.test.ts — Unit tests for the 30-day soft-delete GC.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadStore } from '../agentChat/threadStore';
import type { AgentChatThreadRecord } from '../agentChat/types';
import type { Session } from './session';
import type { SessionStore } from './sessionStore';
import { runSoftDeleteGc, THIRTY_DAYS_MS } from './softDeleteGc';

// ─── Fake timers ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-04-15T00:00:00Z');
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Fixture factories ────────────────────────────────────────────────────────

const NOW = new Date('2026-04-15T00:00:00Z').getTime();

function makeSession(id: string, deletedAt?: number): Session {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    projectRoot: '/projects/test',
    worktree: false,
    pinned: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
    deletedAt,
  };
}

function makeThread(id: string, deletedAt?: number): AgentChatThreadRecord {
  return {
    version: 1,
    id,
    workspaceRoot: '/projects/test',
    createdAt: NOW,
    updatedAt: NOW,
    title: 'Test Thread',
    status: 'idle',
    messages: [],
    deletedAt,
  };
}

function makeSessionStore(sessions: Session[]): SessionStore {
  const store = [...sessions];
  return {
    getById: (id) => store.find((s) => s.id === id),
    listAll: () => [...store],
    listByProjectRoot: (root) => store.filter((s) => s.projectRoot === root),
    listActive: () => store.filter((s) => !s.archivedAt && !s.deletedAt),
    upsert: vi.fn(),
    archive: vi.fn(),
    delete: (id) => { const i = store.findIndex((s) => s.id === id); if (i >= 0) store.splice(i, 1); },
    pin: vi.fn(),
    softDelete: vi.fn(),
    restoreDeleted: vi.fn(),
  };
}

function makeThreadStore(threads: AgentChatThreadRecord[]): AgentChatThreadStore {
  const store = [...threads];
  return {
    listThreads: vi.fn().mockResolvedValue([...store]),
    deleteThread: vi.fn().mockImplementation(async (id: string) => {
      const i = store.findIndex((t) => t.id === id);
      if (i >= 0) store.splice(i, 1);
      return true;
    }),
    createThread: vi.fn(),
    loadThread: vi.fn(),
    loadLatestThread: vi.fn(),
    updateThread: vi.fn(),
    appendMessage: vi.fn(),
    updateMessage: vi.fn(),
    updateTitleFromResponse: vi.fn(),
    branchThread: vi.fn(),
    getStorageDirectory: vi.fn().mockReturnValue('/tmp/threads'),
    getTags: vi.fn().mockResolvedValue([]),
    setTags: vi.fn(),
    searchThreads: vi.fn().mockReturnValue([]),
  } as unknown as AgentChatThreadStore;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runSoftDeleteGc — null stores', () => {
  it('returns zero counts when both stores are null', async () => {
    const result = await runSoftDeleteGc(NOW, null, null);
    expect(result).toEqual({ purgedSessions: 0, purgedThreads: 0 });
  });

  it('handles null sessionStore gracefully', async () => {
    const threadStore = makeThreadStore([]);
    const result = await runSoftDeleteGc(NOW, null, threadStore);
    expect(result.purgedSessions).toBe(0);
  });

  it('handles null threadStore gracefully', async () => {
    const sessionStore = makeSessionStore([]);
    const result = await runSoftDeleteGc(NOW, sessionStore, null);
    expect(result.purgedThreads).toBe(0);
  });
});

describe('runSoftDeleteGc — sessions', () => {
  it('purges sessions whose deletedAt + 30 days < now', async () => {
    const expired = makeSession('s-expired', NOW - THIRTY_DAYS_MS - 1);
    const recent = makeSession('s-recent', NOW - THIRTY_DAYS_MS + 1000);
    const active = makeSession('s-active');
    const store = makeSessionStore([expired, recent, active]);

    const result = await runSoftDeleteGc(NOW, store, null);

    expect(result.purgedSessions).toBe(1);
    expect(store.listAll().map((s) => s.id)).not.toContain('s-expired');
    expect(store.listAll().map((s) => s.id)).toContain('s-recent');
    expect(store.listAll().map((s) => s.id)).toContain('s-active');
  });

  it('does not purge sessions without deletedAt', async () => {
    const session = makeSession('s-no-delete');
    const store = makeSessionStore([session]);
    const result = await runSoftDeleteGc(NOW, store, null);
    expect(result.purgedSessions).toBe(0);
  });

  it('purges multiple expired sessions', async () => {
    const sessions = [
      makeSession('s1', NOW - THIRTY_DAYS_MS - 1000),
      makeSession('s2', NOW - THIRTY_DAYS_MS - 500),
      makeSession('s3', NOW - THIRTY_DAYS_MS + 1000), // not yet expired
    ];
    const store = makeSessionStore(sessions);
    const result = await runSoftDeleteGc(NOW, store, null);
    expect(result.purgedSessions).toBe(2);
  });
});

describe('runSoftDeleteGc — threads', () => {
  it('purges threads whose deletedAt + 30 days < now', async () => {
    const expired = makeThread('t-expired', NOW - THIRTY_DAYS_MS - 1);
    const active = makeThread('t-active');
    const threadStore = makeThreadStore([expired, active]);
    const store = makeSessionStore([]);

    const result = await runSoftDeleteGc(NOW, store, threadStore);

    expect(result.purgedThreads).toBe(1);
    expect(threadStore.deleteThread).toHaveBeenCalledWith('t-expired');
    expect(threadStore.deleteThread).not.toHaveBeenCalledWith('t-active');
  });

  it('does not purge threads without deletedAt', async () => {
    const thread = makeThread('t-active');
    const threadStore = makeThreadStore([thread]);
    const result = await runSoftDeleteGc(NOW, makeSessionStore([]), threadStore);
    expect(result.purgedThreads).toBe(0);
  });

  it('handles listThreads rejection gracefully', async () => {
    const threadStore = {
      listThreads: vi.fn().mockRejectedValue(new Error('db error')),
      deleteThread: vi.fn(),
    } as unknown as AgentChatThreadStore;
    const result = await runSoftDeleteGc(NOW, null, threadStore);
    expect(result.purgedThreads).toBe(0);
    expect(threadStore.deleteThread).not.toHaveBeenCalled();
  });
});

describe('runSoftDeleteGc — boundary conditions', () => {
  it('does not purge when deletedAt + 30 days === now (not strictly less)', async () => {
    // exactly at the boundary: deletedAt + 30d == now → NOT < now → not expired
    const session = makeSession('s-boundary', NOW - THIRTY_DAYS_MS);
    const store = makeSessionStore([session]);
    const result = await runSoftDeleteGc(NOW, store, null);
    expect(result.purgedSessions).toBe(0);
  });

  it('purges when deletedAt + 30 days is 1ms before now', async () => {
    const session = makeSession('s-just-expired', NOW - THIRTY_DAYS_MS - 1);
    const store = makeSessionStore([session]);
    const result = await runSoftDeleteGc(NOW, store, null);
    expect(result.purgedSessions).toBe(1);
  });

  it('returns combined counts for sessions and threads', async () => {
    const sessionStore = makeSessionStore([
      makeSession('s1', NOW - THIRTY_DAYS_MS - 1),
    ]);
    const threadStore = makeThreadStore([
      makeThread('t1', NOW - THIRTY_DAYS_MS - 1),
      makeThread('t2', NOW - THIRTY_DAYS_MS - 1),
    ]);
    const result = await runSoftDeleteGc(NOW, sessionStore, threadStore);
    expect(result.purgedSessions).toBe(1);
    expect(result.purgedThreads).toBe(2);
  });
});
