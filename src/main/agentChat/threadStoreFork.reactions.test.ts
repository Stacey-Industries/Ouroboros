/**
 * threadStoreFork.reactions.test.ts — Wave 41 Phase J (test 8)
 *
 * Verifies that reactions are scoped by (messageId, threadId) composite key.
 * A reaction set on a forked thread must not affect the source thread, even
 * when both threads share the same message ID (copy-on-fork).
 *
 * This tests the Wave 41 E.2 fix: all reaction SQL ops now use
 * "WHERE id = ? AND threadId = ?" to prevent cross-fork leakage.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../storage/database';
import { openDatabase, runTransaction } from '../storage/database';
import {
  getMessageReactionsSql,
  setMessageReactionsSql,
} from './threadStoreSqliteReactions';

// ── Fixture ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let db: Database;

/**
 * Schema matches threadStoreSqlite.ts — composite PK (id, threadId).
 * We insert the same message ID into two threads to simulate the fork scenario.
 */
function setupForkScenario(): void {
  runTransaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        workspaceRoot TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        parentThreadId TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT NOT NULL,
        threadId TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL,
        reactions TEXT,
        collapsedByDefault INTEGER DEFAULT 0,
        PRIMARY KEY (id, threadId)
      );
    `);

    // Source thread
    db.prepare(`
      INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('source-thread', '/workspace', 1000, 1000, 'Source Thread', 'idle');

    // Forked thread (parentThreadId = source-thread)
    db.prepare(`
      INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status, parentThreadId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('fork-thread', '/workspace', 1001, 1001, 'Fork of Source Thread', 'idle', 'source-thread');

    // Same message ID in both threads — this is the fork scenario:
    // forkThreadImpl copies messages with threadId rebased to the fork.
    db.prepare(`
      INSERT INTO messages (id, threadId, role, content, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run('shared-msg-id', 'source-thread', 'user', 'Hello from source', 1001);

    db.prepare(`
      INSERT INTO messages (id, threadId, role, content, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run('shared-msg-id', 'fork-thread', 'user', 'Hello from source', 1001);

    // A message that exists only in the fork (new turn added after forking)
    db.prepare(`
      INSERT INTO messages (id, threadId, role, content, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run('fork-only-msg', 'fork-thread', 'assistant', 'Fork reply', 1002);
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-reactions-test-'));
  db = openDatabase(path.join(tmpDir, 'test.db'));
  setupForkScenario();
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('threadStoreFork.reactions — cross-fork isolation (Wave 41 E.2)', () => {
  it('setting reactions on the fork does not affect the source thread', () => {
    // React on the fork
    setMessageReactionsSql(db, 'shared-msg-id', 'fork-thread', [{ kind: '+1', at: 5000 }]);

    // Source thread must still have no reactions
    const sourceReactions = getMessageReactionsSql(db, 'shared-msg-id', 'source-thread');
    expect(sourceReactions).toHaveLength(0);

    // Fork reactions are stored as expected
    const forkReactions = getMessageReactionsSql(db, 'shared-msg-id', 'fork-thread');
    expect(forkReactions).toHaveLength(1);
    expect(forkReactions[0].kind).toBe('+1');
  });

  it('setting reactions on the source does not affect the fork', () => {
    // React on the source
    setMessageReactionsSql(db, 'shared-msg-id', 'source-thread', [{ kind: '-1', at: 6000 }]);

    // Fork must have no reactions
    const forkReactions = getMessageReactionsSql(db, 'shared-msg-id', 'fork-thread');
    expect(forkReactions).toHaveLength(0);

    // Source reactions are correct
    const sourceReactions = getMessageReactionsSql(db, 'shared-msg-id', 'source-thread');
    expect(sourceReactions).toHaveLength(1);
    expect(sourceReactions[0].kind).toBe('-1');
  });

  it('each thread can accumulate independent reactions on the shared message', () => {
    setMessageReactionsSql(db, 'shared-msg-id', 'source-thread', [
      { kind: '+1', at: 1 },
      { kind: '+1', at: 2 },
    ]);
    setMessageReactionsSql(db, 'shared-msg-id', 'fork-thread', [
      { kind: '-1', at: 3 },
    ]);

    const sourceReactions = getMessageReactionsSql(db, 'shared-msg-id', 'source-thread');
    const forkReactions = getMessageReactionsSql(db, 'shared-msg-id', 'fork-thread');

    expect(sourceReactions).toHaveLength(2);
    expect(sourceReactions.every((r) => r.kind === '+1')).toBe(true);

    expect(forkReactions).toHaveLength(1);
    expect(forkReactions[0].kind).toBe('-1');
  });

  it('reactions on fork-only messages are isolated to the fork', () => {
    setMessageReactionsSql(db, 'fork-only-msg', 'fork-thread', [{ kind: '+1', at: 7000 }]);

    // Attempting to read from the source thread returns nothing (message doesn't exist there)
    const sourceReactions = getMessageReactionsSql(db, 'fork-only-msg', 'source-thread');
    expect(sourceReactions).toHaveLength(0);

    const forkReactions = getMessageReactionsSql(db, 'fork-only-msg', 'fork-thread');
    expect(forkReactions).toHaveLength(1);
  });

  it('clearing reactions on fork does not clear source reactions', () => {
    setMessageReactionsSql(db, 'shared-msg-id', 'source-thread', [{ kind: '+1', at: 1 }]);
    setMessageReactionsSql(db, 'shared-msg-id', 'fork-thread', [{ kind: '+1', at: 2 }]);

    // Clear fork reactions
    setMessageReactionsSql(db, 'shared-msg-id', 'fork-thread', []);

    // Source still has its reaction
    const sourceReactions = getMessageReactionsSql(db, 'shared-msg-id', 'source-thread');
    expect(sourceReactions).toHaveLength(1);
  });
});
