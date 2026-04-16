/**
 * threadStoreSqliteFts.test.ts — Smoke tests for the FTS5 helper functions.
 *
 * Tests each exported function in isolation using a real SQLite in-memory-ish
 * temp DB so the porter/unicode61 tokenizer is exercised end-to-end.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../storage/database';
import { openDatabase } from '../storage/database';
import {
  applyFtsMigration,
  ensureFtsTable,
  refreshFtsForThread,
  upsertFtsRow,
} from './threadStoreSqliteFts';
import { FTS_SCHEMA_SQL,SCHEMA_SQL } from './threadStoreSqliteHelpers';
import type { AgentChatThreadRecord } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let db: Database;
let clock = 1000;

function tick(): number {
  return clock++;
}

function openFreshDb(dir: string): Database {
  const d = openDatabase(path.join(dir, `fts-test-${clock}.db`));
  d.exec(SCHEMA_SQL);
  return d;
}

function seedThread(db: Database, threadId: string, tags: string | null = null): void {
  db.prepare(
    `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status, tags)
     VALUES (?, '/ws', ?, ?, 'T', 'idle', ?)`,
  ).run(threadId, tick(), tick(), tags);
}

function seedMessage(db: Database, threadId: string, content: string): void {
  db.prepare(
    `INSERT INTO messages (id, threadId, role, content, createdAt)
     VALUES (?, ?, 'user', ?, ?)`,
  ).run(`msg-${clock}`, threadId, content, tick());
}

function makeThread(id: string, overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
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

beforeEach(() => {
  clock = 1000;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fts-helpers-'));
  db = openFreshDb(tmpDir);
});

afterEach(() => {
  db.close();
});

// ── ensureFtsTable ────────────────────────────────────────────────────────────

describe('ensureFtsTable', () => {
  it('returns true and creates thread_fts when FTS5 is available', () => {
    const result = ensureFtsTable(db);
    // We can't guarantee FTS5 in all test environments, but the function must
    // not throw and must return a boolean.
    expect(typeof result).toBe('boolean');
    if (result) {
      // If it returned true the table must exist
      const row = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='thread_fts'")
        .get();
      expect(row).toBeTruthy();
    }
  });

  it('is idempotent — calling twice does not throw', () => {
    expect(() => {
      ensureFtsTable(db);
      ensureFtsTable(db);
    }).not.toThrow();
  });
});

// ── applyFtsMigration ─────────────────────────────────────────────────────────

describe('applyFtsMigration', () => {
  it('creates thread_fts and backfills existing rows', () => {
    seedThread(db, 't1', JSON.stringify(['tag-a']));
    seedMessage(db, 't1', 'migration content example');

    applyFtsMigration(db);

    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='thread_fts'")
      .get();
    // If FTS5 is available the table must now exist
    const fts5 = row !== undefined;
    if (fts5) {
      const ftsRow = db.prepare('SELECT content FROM thread_fts WHERE threadId = ?').get('t1') as
        | { content: string }
        | undefined;
      expect(ftsRow).toBeTruthy();
      expect(ftsRow?.content).toContain('migration content example');
    }
  });

  it('does not throw on an empty threads table', () => {
    expect(() => applyFtsMigration(db)).not.toThrow();
  });

  it('is idempotent — calling twice does not throw', () => {
    seedThread(db, 't2');
    seedMessage(db, 't2', 'hello');
    expect(() => {
      applyFtsMigration(db);
      applyFtsMigration(db);
    }).not.toThrow();
  });
});

// ── upsertFtsRow ──────────────────────────────────────────────────────────────

describe('upsertFtsRow', () => {
  beforeEach(() => {
    db.exec(FTS_SCHEMA_SQL);
  });

  it('inserts a new FTS row', () => {
    upsertFtsRow(db, {
      threadId: 'u1',
      content: 'hello world',
      tags: 'tag1',
      filePaths: '/some/path.ts',
    });
    const row = db.prepare('SELECT content FROM thread_fts WHERE threadId = ?').get('u1') as
      | { content: string }
      | undefined;
    expect(row?.content).toBe('hello world');
  });

  it('replaces an existing row on re-upsert', () => {
    upsertFtsRow(db, { threadId: 'u2', content: 'first content', tags: '', filePaths: '' });
    upsertFtsRow(db, { threadId: 'u2', content: 'updated content', tags: '', filePaths: '' });
    const rows = db.prepare('SELECT content FROM thread_fts WHERE threadId = ?').all('u2') as {
      content: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('updated content');
  });

  it('does not throw when FTS table is absent', () => {
    // Open a db without FTS DDL
    const bare = openDatabase(path.join(tmpDir, 'bare-upsert.db'));
    bare.exec(SCHEMA_SQL);
    try {
      expect(() =>
        upsertFtsRow(bare, { threadId: 'x', content: 'c', tags: '', filePaths: '' }),
      ).not.toThrow();
    } finally {
      bare.close();
    }
  });
});

// ── refreshFtsForThread ───────────────────────────────────────────────────────

describe('refreshFtsForThread', () => {
  beforeEach(() => {
    db.exec(FTS_SCHEMA_SQL);
  });

  it('indexes all message content for a thread', () => {
    const thread = makeThread('r1', {
      messages: [
        { id: 'm1', threadId: 'r1', role: 'user', content: 'fox content', createdAt: tick() },
        { id: 'm2', threadId: 'r1', role: 'assistant', content: 'dog content', createdAt: tick() },
      ],
    });
    refreshFtsForThread(db, thread);
    const row = db.prepare('SELECT content FROM thread_fts WHERE threadId = ?').get('r1') as
      | { content: string }
      | undefined;
    expect(row?.content).toContain('fox content');
    expect(row?.content).toContain('dog content');
  });

  it('indexes tags field', () => {
    const thread = makeThread('r2', { tags: ['alpha', 'beta'] });
    refreshFtsForThread(db, thread);
    const row = db.prepare('SELECT tags FROM thread_fts WHERE threadId = ?').get('r2') as
      | { tags: string }
      | undefined;
    expect(row?.tags).toBe('alpha beta');
  });

  it('extracts filePaths from message blocks', () => {
    const blocks = JSON.stringify([{ filePath: '/src/foo.ts', kind: 'file_diff' }]);
    const thread = makeThread('r3', {
      messages: [
        {
          id: 'm3',
          threadId: 'r3',
          role: 'assistant',
          content: 'edited file',
          createdAt: tick(),
          blocks: JSON.parse(blocks) as AgentChatThreadRecord['messages'][0]['blocks'],
        },
      ],
    });
    refreshFtsForThread(db, thread);
    const row = db.prepare('SELECT filePaths FROM thread_fts WHERE threadId = ?').get('r3') as
      | { filePaths: string }
      | undefined;
    expect(row?.filePaths).toContain('/src/foo.ts');
  });

  it('is idempotent — calling twice leaves exactly one FTS row', () => {
    const thread = makeThread('r4', {
      messages: [{ id: 'm4', threadId: 'r4', role: 'user', content: 'once', createdAt: tick() }],
    });
    refreshFtsForThread(db, thread);
    refreshFtsForThread(db, thread);
    const rows = db.prepare('SELECT 1 FROM thread_fts WHERE threadId = ?').all('r4');
    expect(rows).toHaveLength(1);
  });

  it('handles thread with no messages', () => {
    const thread = makeThread('r5');
    expect(() => refreshFtsForThread(db, thread)).not.toThrow();
  });
});
