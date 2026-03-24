import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThreadStoreSqliteRuntime } from './threadStoreSqlite';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

let tmpDir: string;
let runtime: ThreadStoreSqliteRuntime;
let clock: number;

function tick(): number {
  return clock++;
}

function makeThread(
  id: string,
  overrides: Partial<AgentChatThreadRecord> = {},
): AgentChatThreadRecord {
  return {
    version: 1,
    id,
    workspaceRoot: '/workspace',
    createdAt: tick(),
    updatedAt: tick(),
    title: `Thread ${id}`,
    status: 'idle',
    messages: [],
    ...overrides,
  };
}

function makeMessage(
  id: string,
  overrides: Partial<AgentChatMessageRecord> = {},
): AgentChatMessageRecord {
  return {
    id,
    threadId: 'thread-1',
    role: 'user',
    content: `Message ${id}`,
    createdAt: tick(),
    ...overrides,
  };
}

beforeEach(() => {
  clock = 1000;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-test-'));
  runtime = new ThreadStoreSqliteRuntime({
    maxThreads: 100,
    now: () => tick(),
    threadsDir: tmpDir,
  });
});

afterEach(() => {
  runtime.close();
});

describe('ThreadStoreSqliteRuntime', () => {
  describe('getStorageDirectory', () => {
    it('returns the configured directory', () => {
      expect(runtime.getStorageDirectory()).toBe(tmpDir);
    });
  });

  describe('writeThread / readThread', () => {
    it('round-trips a thread', async () => {
      const thread = makeThread('t1');
      await runtime.writeThread(thread);
      const loaded = await runtime.readThread('t1');
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('t1');
      expect(loaded!.title).toBe('Thread t1');
    });

    it('round-trips a thread with messages', async () => {
      const thread = makeThread('t1', {
        messages: [
          makeMessage('m1', { threadId: 't1', role: 'user', content: 'Hello' }),
          makeMessage('m2', { threadId: 't1', role: 'assistant', content: 'Hi there' }),
        ],
      });
      await runtime.writeThread(thread);
      const loaded = await runtime.readThread('t1');
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[0].content).toBe('Hello');
    });

    it('replaces thread on re-write', async () => {
      await runtime.writeThread(makeThread('t1', { title: 'V1' }));
      await runtime.writeThread(makeThread('t1', { title: 'V2' }));
      const loaded = await runtime.readThread('t1');
      expect(loaded!.title).toBe('V2');
    });
  });

  describe('readThread for missing ID', () => {
    it('returns null', async () => {
      expect(await runtime.readThread('missing')).toBeNull();
    });
  });

  describe('loadAllThreads', () => {
    it('returns all threads sorted by updatedAt DESC', async () => {
      await runtime.writeThread(makeThread('old', { updatedAt: 100 }));
      await runtime.writeThread(makeThread('new', { updatedAt: 200 }));
      const all = await runtime.loadAllThreads();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe('new');
    });
  });

  describe('deleteThread', () => {
    it('removes the thread', async () => {
      await runtime.writeThread(makeThread('t1'));
      const deleted = await runtime.deleteThread('t1');
      expect(deleted).toBe(true);
      expect(await runtime.readThread('t1')).toBeNull();
    });

    it('returns false for missing thread', async () => {
      expect(await runtime.deleteThread('missing')).toBe(false);
    });

    it('cascade deletes messages', async () => {
      await runtime.writeThread(
        makeThread('t1', {
          messages: [makeMessage('m1', { threadId: 't1' })],
        }),
      );
      await runtime.deleteThread('t1');
      // Re-creating thread with same ID should not see old messages
      await runtime.writeThread(makeThread('t1'));
      const loaded = await runtime.readThread('t1');
      expect(loaded!.messages).toHaveLength(0);
    });
  });

  describe('requireThread', () => {
    it('throws for missing thread', async () => {
      await expect(runtime.requireThread('missing')).rejects.toThrow('Chat thread not found');
    });
  });

  describe('updateTitleFromResponse', () => {
    it('updates title from assistant response', async () => {
      await runtime.writeThread(
        makeThread('t1', {
          title: 'Hello world',
          messages: [makeMessage('m1', { threadId: 't1', role: 'user', content: 'Hello world' })],
        }),
      );
      const updated = await runtime.updateTitleFromResponse(
        't1',
        'This is a helpful response. More text here.',
      );
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('This is a helpful response.');
    });

    it('returns null when title does not match first user message', async () => {
      await runtime.writeThread(
        makeThread('t1', {
          title: 'Custom title',
          messages: [makeMessage('m1', { threadId: 't1', role: 'user', content: 'Hello world' })],
        }),
      );
      const updated = await runtime.updateTitleFromResponse('t1', 'Whatever');
      expect(updated).toBeNull();
    });
  });

  describe('runMutation', () => {
    it('is a pass-through that executes the action', async () => {
      const result = await runtime.runMutation(async () => 42);
      expect(result).toBe(42);
    });
  });

  describe('pruning', () => {
    it('prunes threads beyond maxThreads', async () => {
      const small = new ThreadStoreSqliteRuntime({
        maxThreads: 2,
        now: () => tick(),
        threadsDir: tmpDir,
      });
      try {
        await small.writeThread(makeThread('a', { updatedAt: 100 }));
        await small.writeThread(makeThread('b', { updatedAt: 200 }));
        await small.writeThread(makeThread('c', { updatedAt: 300 }));
        const all = await small.loadAllThreads();
        expect(all.length).toBeLessThanOrEqual(2);
      } finally {
        small.close();
      }
    });
  });

  describe('message field roundtrips', () => {
    it('preserves optional JSON fields', async () => {
      const msg = makeMessage('m1', {
        threadId: 't1',
        role: 'assistant',
        statusKind: 'progress',
        orchestration: { taskId: 'task-1', sessionId: 'sess-1' },
        contextSummary: { selectedFileCount: 5, omittedFileCount: 2, usedAdvancedControls: true },
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        toolsSummary: '3 tools used',
        costSummary: '$0.05',
        durationSummary: '12s',
      });
      await runtime.writeThread(makeThread('t1', { messages: [msg] }));
      const loaded = await runtime.readThread('t1');
      const m = loaded!.messages[0];
      expect(m.statusKind).toBe('progress');
      expect(m.orchestration).toEqual({ taskId: 'task-1', sessionId: 'sess-1' });
      expect(m.contextSummary?.selectedFileCount).toBe(5);
      expect(m.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50 });
      expect(m.toolsSummary).toBe('3 tools used');
    });
  });
});
