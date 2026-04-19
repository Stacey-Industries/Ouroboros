/**
 * threadStoreSqliteReactions.test.ts — unit tests for the SQL-level reaction
 * and collapsed helpers extracted in Wave 22 Phase A.
 *
 * Wave 41 E.2 — all ops now use composite (id, threadId) PK.
 */

import type { Reaction } from '@shared/types/agentChat';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../storage/database';
import { openDatabase, runTransaction } from '../storage/database';
import {
  enforceReactionCap,
  getMessageReactionsSql,
  MAX_REACTIONS_PER_MESSAGE,
  setMessageCollapsedSql,
  setMessageReactionsSql,
} from './threadStoreSqliteReactions';

// ── Fixture ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let db: Database;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reactions-test-'));
  db = openDatabase(path.join(tmpDir, 'test.db'));

  // Minimal schema with the Wave 22 columns and composite PK
  runTransaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY, workspaceRoot TEXT NOT NULL,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
        title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle'
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT NOT NULL, threadId TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL,
        reactions TEXT, collapsedByDefault INTEGER DEFAULT 0,
        PRIMARY KEY (id, threadId)
      );
    `);
    db.prepare(
      `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('t1', '/workspace', 1000, 1000, 'Thread 1', 'idle');
    db.prepare(
      `INSERT INTO messages (id, threadId, role, content, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('msg-1', 't1', 'user', 'Hello', 1001);
  });
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── getMessageReactionsSql ────────────────────────────────────────────────────

describe('getMessageReactionsSql', () => {
  it('returns empty array for a message with no reactions', () => {
    expect(getMessageReactionsSql(db, 'msg-1', 't1')).toEqual([]);
  });

  it('returns empty array for an unknown messageId', () => {
    expect(getMessageReactionsSql(db, 'nonexistent', 't1')).toEqual([]);
  });

  it('returns stored reactions after a set', () => {
    setMessageReactionsSql(db, 'msg-1', 't1', [{ kind: '+1', at: 9000 }]);
    const result = getMessageReactionsSql(db, 'msg-1', 't1');
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('+1');
    expect(result[0].at).toBe(9000);
  });
});

// ── setMessageReactionsSql ────────────────────────────────────────────────────

describe('setMessageReactionsSql', () => {
  it('persists a +1 reaction', () => {
    setMessageReactionsSql(db, 'msg-1', 't1', [{ kind: '+1', at: 1000 }]);
    expect(getMessageReactionsSql(db, 'msg-1', 't1')).toHaveLength(1);
  });

  it('replaces existing reactions on second call', () => {
    setMessageReactionsSql(db, 'msg-1', 't1', [{ kind: '+1', at: 1 }, { kind: '-1', at: 2 }]);
    // Cast: SQL layer is dumb storage; validation happens at the IPC boundary.
    setMessageReactionsSql(db, 'msg-1', 't1', [{ kind: '-1', at: 3 }]);
    const result = getMessageReactionsSql(db, 'msg-1', 't1');
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('-1');
  });

  it('stores NULL when given an empty array', () => {
    setMessageReactionsSql(db, 'msg-1', 't1', [{ kind: '+1', at: 1 }]);
    setMessageReactionsSql(db, 'msg-1', 't1', []);
    const row = db
      .prepare('SELECT reactions FROM messages WHERE id = ? AND threadId = ?')
      .get('msg-1', 't1') as { reactions: string | null };
    expect(row.reactions).toBeNull();
    expect(getMessageReactionsSql(db, 'msg-1', 't1')).toEqual([]);
  });

  it('preserves by field when present', () => {
    setMessageReactionsSql(db, 'msg-1', 't1', [{ kind: '+1', by: 'user1', at: 42 }]);
    const result = getMessageReactionsSql(db, 'msg-1', 't1');
    expect(result[0].by).toBe('user1');
  });
});

// ── enforceReactionCap ────────────────────────────────────────────────────────

describe('enforceReactionCap', () => {
  it('returns the same array when at or below cap', () => {
    const reactions: Reaction[] = Array.from({ length: MAX_REACTIONS_PER_MESSAGE }, (_, i) => ({
      kind: '+1' as const,
      at: i,
    }));
    expect(enforceReactionCap(reactions)).toHaveLength(MAX_REACTIONS_PER_MESSAGE);
  });

  it('evicts the oldest reaction (lowest at) when cap is exceeded', () => {
    const reactions: Reaction[] = Array.from({ length: MAX_REACTIONS_PER_MESSAGE + 1 }, (_, i) => ({
      kind: '+1' as const,
      at: i,        // at=0 is the oldest
    }));
    const result = enforceReactionCap(reactions);
    expect(result).toHaveLength(MAX_REACTIONS_PER_MESSAGE);
    // The oldest (at=0) must not be present; the newest (at=MAX) must be present.
    expect(result.find((r) => r.at === 0)).toBeUndefined();
    expect(result.find((r) => r.at === MAX_REACTIONS_PER_MESSAGE)).toBeDefined();
  });

  it('evicts multiple oldest reactions when far over cap', () => {
    const reactions: Reaction[] = Array.from({ length: MAX_REACTIONS_PER_MESSAGE + 5 }, (_, i) => ({
      kind: '-1' as const,
      at: i,
    }));
    const result = enforceReactionCap(reactions);
    expect(result).toHaveLength(MAX_REACTIONS_PER_MESSAGE);
    // The 5 oldest (at 0..4) should all be gone.
    for (let i = 0; i < 5; i++) {
      expect(result.find((r) => r.at === i)).toBeUndefined();
    }
  });

  it('does not mutate the input array', () => {
    const reactions: Reaction[] = Array.from({ length: MAX_REACTIONS_PER_MESSAGE + 1 }, (_, i) => ({
      kind: '+1' as const,
      at: i,
    }));
    const original = [...reactions];
    enforceReactionCap(reactions);
    expect(reactions).toHaveLength(original.length);
  });
});

// ── setMessageCollapsedSql ────────────────────────────────────────────────────

describe('setMessageCollapsedSql', () => {
  it('sets collapsedByDefault to 1', () => {
    setMessageCollapsedSql(db, 'msg-1', 't1', true);
    const row = db
      .prepare('SELECT collapsedByDefault FROM messages WHERE id = ? AND threadId = ?')
      .get('msg-1', 't1') as { collapsedByDefault: number };
    expect(row.collapsedByDefault).toBe(1);
  });

  it('sets collapsedByDefault to 0', () => {
    setMessageCollapsedSql(db, 'msg-1', 't1', true);
    setMessageCollapsedSql(db, 'msg-1', 't1', false);
    const row = db
      .prepare('SELECT collapsedByDefault FROM messages WHERE id = ? AND threadId = ?')
      .get('msg-1', 't1') as { collapsedByDefault: number };
    expect(row.collapsedByDefault).toBe(0);
  });

  it('is idempotent when called twice with same value', () => {
    setMessageCollapsedSql(db, 'msg-1', 't1', true);
    setMessageCollapsedSql(db, 'msg-1', 't1', true);
    const row = db
      .prepare('SELECT collapsedByDefault FROM messages WHERE id = ? AND threadId = ?')
      .get('msg-1', 't1') as { collapsedByDefault: number };
    expect(row.collapsedByDefault).toBe(1);
  });
});
