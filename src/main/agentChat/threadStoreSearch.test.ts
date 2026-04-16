import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from '../storage/database';
import { searchThreads } from './threadStoreSearch';
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
  threadId: string,
  content: string,
  overrides: Partial<AgentChatMessageRecord> = {},
): AgentChatMessageRecord {
  return {
    id,
    threadId,
    role: 'user',
    content,
    createdAt: tick(),
    ...overrides,
  };
}

beforeEach(() => {
  clock = 1000;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-test-'));
  runtime = new ThreadStoreSqliteRuntime({
    maxThreads: 10000,
    now: () => tick(),
    threadsDir: tmpDir,
  });
});

afterEach(() => {
  runtime.close();
});

describe('searchThreads', () => {
  describe('basic search', () => {
    it('returns empty array for empty query', async () => {
      await runtime.writeThread(
        makeThread('t1', { messages: [makeMessage('m1', 't1', 'hello world')] }),
      );
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        expect(searchThreads(db, '')).toEqual([]);
        expect(searchThreads(db, '   ')).toEqual([]);
      } finally {
        db.close();
      }
    });

    it('finds a thread by message content', async () => {
      await runtime.writeThread(
        makeThread('t1', {
          messages: [makeMessage('m1', 't1', 'The quick brown fox jumps over the lazy dog')],
        }),
      );
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        const results = searchThreads(db, 'fox');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].threadId).toBe('t1');
      } finally {
        db.close();
      }
    });

    it('returns empty when no threads match', async () => {
      await runtime.writeThread(
        makeThread('t1', { messages: [makeMessage('m1', 't1', 'all about cats')] }),
      );
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        const results = searchThreads(db, 'zebra');
        expect(results).toHaveLength(0);
      } finally {
        db.close();
      }
    });

    it('result has non-empty snippet', async () => {
      await runtime.writeThread(
        makeThread('t1', {
          messages: [makeMessage('m1', 't1', 'unique_keyword appears here in message')],
        }),
      );
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        const results = searchThreads(db, 'unique_keyword');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].snippet).toBeTruthy();
      } finally {
        db.close();
      }
    });

    it('result has score field', async () => {
      await runtime.writeThread(
        makeThread('t1', { messages: [makeMessage('m1', 't1', 'hello world')] }),
      );
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        const results = searchThreads(db, 'hello');
        expect(results.length).toBeGreaterThan(0);
        expect(typeof results[0].score).toBe('number');
      } finally {
        db.close();
      }
    });
  });

  describe('threadId filter', () => {
    it('scopes results to specified threadId', async () => {
      await runtime.writeThread(
        makeThread('t1', { messages: [makeMessage('m1', 't1', 'elephant in the room')] }),
      );
      await runtime.writeThread(
        makeThread('t2', { messages: [makeMessage('m2', 't2', 'elephant never forgets')] }),
      );
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        const results = searchThreads(db, 'elephant', { threadId: 't1' });
        expect(results.every((r) => r.threadId === 't1')).toBe(true);
      } finally {
        db.close();
      }
    });
  });

  describe('limit option', () => {
    it('respects limit option', async () => {
      for (let i = 0; i < 10; i++) {
        await runtime.writeThread(
          makeThread(`t${i}`, {
            messages: [makeMessage(`m${i}`, `t${i}`, `search target content item ${i}`)],
          }),
        );
      }
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        const results = searchThreads(db, 'search target', { limit: 3 });
        expect(results.length).toBeLessThanOrEqual(3);
      } finally {
        db.close();
      }
    });
  });

  describe('tag indexing', () => {
    it('finds thread by tag after setTags', async () => {
      await runtime.writeThread(makeThread('t1', { messages: [makeMessage('m1', 't1', 'misc')] }));
      await runtime.setTags('t1', ['auto:typescript', 'frontend']);
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        const results = searchThreads(db, 'frontend');
        expect(results.some((r) => r.threadId === 't1')).toBe(true);
      } finally {
        db.close();
      }
    });
  });

  describe('fallback path (no FTS table)', () => {
    it('returns results via LIKE when thread_fts table is absent', () => {
      const dbPath = path.join(tmpDir, 'bare.db');
      const db = openDatabase(dbPath);
      try {
        // Create messages table without FTS virtual table
        db.exec(`
          CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
            createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
            title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle'
          );
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT NOT NULL, threadId TEXT NOT NULL,
            role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
            createdAt INTEGER NOT NULL,
            PRIMARY KEY (id, threadId)
          );
        `);
        db.prepare(
          'INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status) VALUES (?,?,?,?,?,?)',
        ).run('bare-t1', '/ws', 1, 2, 'Bare', 'idle');
        db.prepare(
          'INSERT INTO messages (id, threadId, role, content, createdAt) VALUES (?,?,?,?,?)',
        ).run('bare-m1', 'bare-t1', 'user', 'fallback search content here', 1);

        const results = searchThreads(db, 'fallback');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].threadId).toBe('bare-t1');
        expect(results[0].snippet).toContain('fallback');
      } finally {
        db.close();
      }
    });
  });

  describe('special characters', () => {
    it('handles query with special FTS characters without throwing', async () => {
      await runtime.writeThread(
        makeThread('t1', { messages: [makeMessage('m1', 't1', 'some normal content')] }),
      );
      const db = openDatabase(path.join(tmpDir, 'threads.db'));
      try {
        expect(() => searchThreads(db, '"quoted" AND OR')).not.toThrow();
        expect(() => searchThreads(db, '(parentheses)')).not.toThrow();
        expect(() => searchThreads(db, 'star*')).not.toThrow();
      } finally {
        db.close();
      }
    });
  });
});

describe('searchThreads — perf (1000 threads × 10 messages)', () => {
  vi.setConfig({ testTimeout: 10000 });

  it('returns in < 200 ms on a 1000-thread corpus', async () => {
    const THREADS = 1000;
    const MSGS_PER_THREAD = 10;
    const KEYWORD = 'perfkeyword';

    // Seed corpus — batch-insert for speed
    for (let t = 0; t < THREADS; t++) {
      const messages: AgentChatMessageRecord[] = [];
      for (let m = 0; m < MSGS_PER_THREAD; m++) {
        const content =
          m === 0
            ? `${KEYWORD} appears in thread ${t} message ${m}`
            : `ordinary content thread ${t} message ${m}`;
        messages.push(makeMessage(`m-${t}-${m}`, `perf-t${t}`, content));
      }
      await runtime.writeThread(makeThread(`perf-t${t}`, { messages }));
    }

    const db = openDatabase(path.join(tmpDir, 'threads.db'));
    try {
      // Warmup lap
      searchThreads(db, KEYWORD, { limit: 20 });

      // Timed lap
      const start = performance.now();
      const results = searchThreads(db, KEYWORD, { limit: 20 });
      const elapsed = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(200);
    } finally {
      db.close();
    }
  });
});
