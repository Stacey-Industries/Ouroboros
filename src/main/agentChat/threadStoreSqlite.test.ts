import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, runTransaction, setSchemaVersion } from '../storage/database';
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
        model: 'claude-opus-4-6',
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
      expect(m.model).toBe('claude-opus-4-6');
      expect(m.toolsSummary).toBe('3 tools used');
    });
  });

  describe('tags — getTags / setTags', () => {
    it('returns empty array for a thread with no tags', async () => {
      await runtime.writeThread(makeThread('t1'));
      expect(await runtime.getTags('t1')).toEqual([]);
    });

    it('returns empty array for a missing thread', async () => {
      expect(await runtime.getTags('nonexistent')).toEqual([]);
    });

    it('persists and retrieves tags', async () => {
      await runtime.writeThread(makeThread('t1'));
      await runtime.setTags('t1', ['auto:typescript', 'frontend']);
      const tags = await runtime.getTags('t1');
      expect(tags).toEqual(['auto:typescript', 'frontend']);
    });

    it('replaces tags on second setTags call', async () => {
      await runtime.writeThread(makeThread('t1'));
      await runtime.setTags('t1', ['auto:typescript']);
      await runtime.setTags('t1', ['auto:python', 'backend']);
      expect(await runtime.getTags('t1')).toEqual(['auto:python', 'backend']);
    });

    it('clears tags when passed empty array', async () => {
      await runtime.writeThread(makeThread('t1'));
      await runtime.setTags('t1', ['auto:typescript']);
      await runtime.setTags('t1', []);
      expect(await runtime.getTags('t1')).toEqual([]);
    });

    it('round-trips tags through writeThread', async () => {
      await runtime.writeThread(makeThread('t1', { tags: ['auto:go', 'manual-tag'] }));
      const loaded = await runtime.readThread('t1');
      expect(loaded!.tags).toEqual(['auto:go', 'manual-tag']);
    });
  });

  describe('schema v6→v7 migration', () => {
    it('adds reactions and collapsedByDefault columns and preserves data', async () => {
      const dbPath = path.join(tmpDir, 'threads.db');

      // Build a v6 fixture — threads + messages without the v7 columns
      const db = openDatabase(dbPath);
      runTransaction(db, () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
            createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
            title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
            latestOrchestration TEXT, branchInfo TEXT, tags TEXT,
            pinned INTEGER DEFAULT 0, deletedAt INTEGER
          );
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT NOT NULL, threadId TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
            role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL,
            statusKind TEXT, orchestration TEXT, contextSummary TEXT,
            verificationPreview TEXT, error TEXT, toolsSummary TEXT,
            costSummary TEXT, durationSummary TEXT, tokenUsage TEXT, blocks TEXT,
            model TEXT, checkpointCommit TEXT,
            PRIMARY KEY (id, threadId)
          );
        `);
        db.prepare(
          `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run('v6-thread', '/workspace', 1000, 2000, 'Old Thread v6', 'idle');
        db.prepare(
          `INSERT INTO messages (id, threadId, role, content, createdAt)
           VALUES (?, ?, ?, ?, ?)`,
        ).run('v6-msg-1', 'v6-thread', 'user', 'Hello from v6', 3000);
        setSchemaVersion(db, 6);
      });
      db.close();

      // Open via runtime — triggers v6→v7 migration
      const migrated = new ThreadStoreSqliteRuntime({
        maxThreads: 100,
        now: () => tick(),
        threadsDir: tmpDir,
      });

      try {
        // Verify existing thread and message data are preserved
        const thread = await migrated.readThread('v6-thread');
        expect(thread).not.toBeNull();
        expect(thread!.title).toBe('Old Thread v6');
        expect(thread!.messages).toHaveLength(1);
        expect(thread!.messages[0].content).toBe('Hello from v6');

        // Verify new columns exist and default correctly by round-tripping through the runtime
        const reactions = await migrated.getMessageReactions('v6-msg-1', 'v6-thread');
        expect(reactions).toEqual([]);

        // Verify we can write and read reactions on the migrated message
        await migrated.setMessageReactions('v6-msg-1', 'v6-thread', [{ kind: '+1', at: 9999 }]);
        const updated = await migrated.getMessageReactions('v6-msg-1', 'v6-thread');
        expect(updated).toHaveLength(1);
        expect(updated[0].kind).toBe('+1');

        // Verify collapsedByDefault round-trips
        await migrated.setMessageCollapsed('v6-msg-1', 'v6-thread', true);
        const loaded = await migrated.readThread('v6-thread');
        expect(loaded!.messages[0].collapsedByDefault).toBe(true);
      } finally {
        migrated.close();
      }
    });
  });

  describe('schema v3→v4 migration', () => {
    it('adds tags column to an existing v3 database and preserves data', async () => {
      const dbPath = path.join(tmpDir, 'threads.db');

      // Build a v3 fixture: threads table without tags column
      const db = openDatabase(dbPath);
      runTransaction(db, () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
            createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
            title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
            latestOrchestration TEXT, branchInfo TEXT
          );
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT NOT NULL, threadId TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
            role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL,
            statusKind TEXT, orchestration TEXT, contextSummary TEXT,
            verificationPreview TEXT, error TEXT, toolsSummary TEXT,
            costSummary TEXT, durationSummary TEXT, tokenUsage TEXT, blocks TEXT,
            model TEXT, checkpointCommit TEXT,
            PRIMARY KEY (id, threadId)
          );
        `);
        db.prepare(
          `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run('existing-thread', '/workspace', 1000, 2000, 'Old Thread', 'idle');
        setSchemaVersion(db, 3);
      });
      db.close();

      // Open via runtime — should trigger v3→v4 migration
      const migrated = new ThreadStoreSqliteRuntime({
        maxThreads: 100,
        now: () => tick(),
        threadsDir: tmpDir,
      });

      try {
        // Existing data is preserved
        const thread = await migrated.readThread('existing-thread');
        expect(thread).not.toBeNull();
        expect(thread!.title).toBe('Old Thread');
        // tags column now exists and defaults to empty
        expect(thread!.tags).toEqual([]);

        // New tags can be set on the migrated DB
        await migrated.setTags('existing-thread', ['auto:typescript']);
        expect(await migrated.getTags('existing-thread')).toEqual(['auto:typescript']);
      } finally {
        migrated.close();
      }
    });
  });
});
