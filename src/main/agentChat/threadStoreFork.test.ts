/**
 * threadStoreFork.test.ts — Wave 23 Phase A
 * Unit tests for forkThreadImpl, renameBranchImpl, listBranchesOfThreadImpl.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  forkThreadImpl,
  listBranchesOfThreadImpl,
  renameBranchImpl,
} from './threadStoreFork';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMsg(
  overrides: Partial<AgentChatMessageRecord> & { id: string },
): AgentChatMessageRecord {
  return {
    threadId: 'thread-src',
    role: 'user',
    content: 'hello',
    createdAt: 1000,
    ...overrides,
  } as AgentChatMessageRecord;
}

function makeThread(
  overrides: Partial<AgentChatThreadRecord> & { id: string },
): AgentChatThreadRecord {
  return {
    version: 1,
    workspaceRoot: '/work',
    createdAt: 1000,
    updatedAt: 1000,
    title: 'My Thread',
    status: 'idle',
    messages: [],
    tags: ['auto:typescript'],
    ...overrides,
  } as AgentChatThreadRecord;
}

function makeRuntime(threads: AgentChatThreadRecord[]) {
  const map = new Map(threads.map((t) => [t.id, t]));
  return {
    requireThread: vi.fn().mockImplementation((id: string) => {
      const t = map.get(id);
      if (!t) return Promise.reject(new Error(`Thread not found: ${id}`));
      return Promise.resolve(t);
    }),
    writeThread: vi.fn().mockImplementation((t: AgentChatThreadRecord) =>
      Promise.resolve(t),
    ),
    loadAllThreads: vi.fn().mockResolvedValue(threads),
    renameBranchSql: vi.fn(),
  };
}

// ── forkThreadImpl ────────────────────────────────────────────────────────────

describe('forkThreadImpl', () => {
  it('creates a new thread with parentThreadId and forkOfMessageId set', async () => {
    const u1 = makeMsg({ id: 'u1', role: 'user', content: 'prompt' });
    const a1 = makeMsg({ id: 'a1', role: 'assistant', content: 'answer' });
    const src = makeThread({ id: 'thread-src', messages: [u1, a1] });
    const runtime = makeRuntime([src]);

    const result = await forkThreadImpl({
      createId: () => 'fork-id',
      now: () => 2000,
      params: { sourceThreadId: 'thread-src', fromMessageId: 'a1', includeHistory: true },
      runtime: runtime as never,
    });

    expect(result.id).toBe('fork-id');
    expect(result.parentThreadId).toBe('thread-src');
    expect(result.forkOfMessageId).toBe('a1');
    expect(result.isSideChat).toBe(false);
  });

  it('copies messages up to and including fromMessageId when includeHistory is true', async () => {
    const u1 = makeMsg({ id: 'u1' });
    const a1 = makeMsg({ id: 'a1', role: 'assistant' });
    const u2 = makeMsg({ id: 'u2', content: 'second' });
    const src = makeThread({ id: 'thread-src', messages: [u1, a1, u2] });
    const runtime = makeRuntime([src]);

    const result = await forkThreadImpl({
      createId: () => 'fork-id',
      now: () => 2000,
      params: { sourceThreadId: 'thread-src', fromMessageId: 'a1', includeHistory: true },
      runtime: runtime as never,
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe('u1');
    expect(result.messages[1].id).toBe('a1');
    expect(result.messages.every((m) => m.threadId === 'fork-id')).toBe(true);
  });

  it('copies only system messages when includeHistory is false', async () => {
    const sys = makeMsg({ id: 'sys', role: 'system', content: 'You are helpful.' });
    const u1 = makeMsg({ id: 'u1' });
    const src = makeThread({ id: 'thread-src', messages: [sys, u1] });
    const runtime = makeRuntime([src]);

    const result = await forkThreadImpl({
      createId: () => 'fork-id',
      now: () => 2000,
      params: { sourceThreadId: 'thread-src', fromMessageId: 'u1', includeHistory: false },
      runtime: runtime as never,
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe('sys');
    expect(result.messages[0].threadId).toBe('fork-id');
  });

  it('marks isSideChat when param is set', async () => {
    const u1 = makeMsg({ id: 'u1' });
    const src = makeThread({ id: 'thread-src', messages: [u1] });
    const runtime = makeRuntime([src]);

    const result = await forkThreadImpl({
      createId: () => 'fork-id',
      now: () => 2000,
      params: {
        sourceThreadId: 'thread-src',
        fromMessageId: 'u1',
        includeHistory: true,
        isSideChat: true,
      },
      runtime: runtime as never,
    });

    expect(result.isSideChat).toBe(true);
    expect(result.title).toMatch(/^Side chat:/);
  });

  it('sets title prefix "Fork of" for regular forks', async () => {
    const u1 = makeMsg({ id: 'u1' });
    const src = makeThread({ id: 'thread-src', messages: [u1] });
    const runtime = makeRuntime([src]);

    const result = await forkThreadImpl({
      createId: () => 'fork-id',
      now: () => 2000,
      params: { sourceThreadId: 'thread-src', fromMessageId: 'u1', includeHistory: false },
      runtime: runtime as never,
    });

    expect(result.title).toBe('Fork of My Thread');
  });

  it('copies tags from source thread', async () => {
    const u1 = makeMsg({ id: 'u1' });
    const src = makeThread({ id: 'thread-src', messages: [u1], tags: ['auto:typescript', 'important'] });
    const runtime = makeRuntime([src]);

    const result = await forkThreadImpl({
      createId: () => 'fork-id',
      now: () => 2000,
      params: { sourceThreadId: 'thread-src', fromMessageId: 'u1', includeHistory: false },
      runtime: runtime as never,
    });

    expect(result.tags).toEqual(['auto:typescript', 'important']);
  });

  it('throws if fromMessageId is not found when includeHistory is true', async () => {
    const u1 = makeMsg({ id: 'u1' });
    const src = makeThread({ id: 'thread-src', messages: [u1] });
    const runtime = makeRuntime([src]);

    await expect(
      forkThreadImpl({
        createId: () => 'fork-id',
        now: () => 2000,
        params: {
          sourceThreadId: 'thread-src',
          fromMessageId: 'not-found',
          includeHistory: true,
        },
        runtime: runtime as never,
      }),
    ).rejects.toThrow('Message not found');
  });
});

// ── renameBranchImpl ──────────────────────────────────────────────────────────

describe('renameBranchImpl', () => {
  it('calls renameBranchSql with the trimmed name', () => {
    const renameBranchSql = vi.fn();
    const runtime = { renameBranchSql };

    renameBranchImpl(runtime as never, 'thread-1', '  my branch  ');

    expect(renameBranchSql).toHaveBeenCalledWith('thread-1', 'my branch');
  });

  it('passes null when name is blank (clears the branch name)', () => {
    const renameBranchSql = vi.fn();
    const runtime = { renameBranchSql };

    renameBranchImpl(runtime as never, 'thread-1', '   ');

    expect(renameBranchSql).toHaveBeenCalledWith('thread-1', null);
  });
});

// ── listBranchesOfThreadImpl ──────────────────────────────────────────────────

describe('listBranchesOfThreadImpl', () => {
  it('returns empty array when no threads reference rootThreadId', async () => {
    const root = makeThread({ id: 'root' });
    const unrelated = makeThread({ id: 'other' });
    const runtime = makeRuntime([root, unrelated]);

    const branches = await listBranchesOfThreadImpl(runtime as never, 'root');

    expect(branches).toHaveLength(0);
  });

  it('returns direct children of the root thread', async () => {
    const root = makeThread({ id: 'root' });
    const child1 = makeThread({ id: 'child1', parentThreadId: 'root', forkOfMessageId: 'm1' });
    const child2 = makeThread({ id: 'child2', parentThreadId: 'root', forkOfMessageId: 'm2', isSideChat: true });
    const runtime = makeRuntime([root, child1, child2]);

    const branches = await listBranchesOfThreadImpl(runtime as never, 'root');

    expect(branches).toHaveLength(2);
    const ids = branches.map((b) => b.id);
    expect(ids).toContain('child1');
    expect(ids).toContain('child2');
  });

  it('nests grandchildren under their parent in the tree', async () => {
    const root = makeThread({ id: 'root' });
    const child = makeThread({ id: 'child', parentThreadId: 'root' });
    const grandchild = makeThread({ id: 'grandchild', parentThreadId: 'child' });
    const runtime = makeRuntime([root, child, grandchild]);

    const branches = await listBranchesOfThreadImpl(runtime as never, 'root');

    expect(branches).toHaveLength(1);
    expect(branches[0].id).toBe('child');
    expect(branches[0].children).toHaveLength(1);
    expect(branches[0].children[0].id).toBe('grandchild');
  });

  it('sets isSideChat correctly on branch nodes', async () => {
    const root = makeThread({ id: 'root' });
    const side = makeThread({ id: 'side', parentThreadId: 'root', isSideChat: true });
    const runtime = makeRuntime([root, side]);

    const branches = await listBranchesOfThreadImpl(runtime as never, 'root');

    expect(branches[0].isSideChat).toBe(true);
  });

  it('propagates branchName to the BranchNode', async () => {
    const root = makeThread({ id: 'root' });
    const named = makeThread({ id: 'named', parentThreadId: 'root', branchName: 'my feature' });
    const runtime = makeRuntime([root, named]);

    const branches = await listBranchesOfThreadImpl(runtime as never, 'root');

    expect(branches[0].branchName).toBe('my feature');
  });
});
