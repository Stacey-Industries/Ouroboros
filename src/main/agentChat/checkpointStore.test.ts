/**
 * checkpointStore.test.ts — Unit tests for the checkpoint SQLite store.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from '../storage/database';
import { closeDatabase, openDatabase } from '../storage/database';
import { CheckpointStore } from './checkpointStore';

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  return path.join(dir, 'checkpoints.db');
}

let db: Database | null = null;
let store: CheckpointStore | null = null;

afterEach(() => {
  store = null;
  closeDatabase(db);
  db = null;
});

function makeStore(dbPath?: string): CheckpointStore {
  const p = dbPath ?? tmpDbPath();
  db = openDatabase(p);
  store = new CheckpointStore(db);
  return store;
}

describe('CheckpointStore.create', () => {
  it('creates a checkpoint and returns it', () => {
    const s = makeStore();
    const cp = s.create({
      threadId: 'thread-1',
      messageId: 'msg-1',
      commitHash: 'abc123',
      filesChanged: ['src/foo.ts'],
    });
    expect(cp.id).toBeTruthy();
    expect(cp.threadId).toBe('thread-1');
    expect(cp.messageId).toBe('msg-1');
    expect(cp.commitHash).toBe('abc123');
    expect(cp.filesChanged).toEqual(['src/foo.ts']);
    expect(cp.createdAt).toBeTruthy();
  });

  it('stores optional label', () => {
    const s = makeStore();
    const cp = s.create({
      threadId: 'thread-1',
      messageId: 'msg-1',
      commitHash: 'abc123',
      filesChanged: [],
      label: 'Before refactor',
    });
    expect(cp.label).toBe('Before refactor');
  });
});

describe('CheckpointStore.list', () => {
  it('returns checkpoints for a thread in creation order', () => {
    const s = makeStore();
    s.create({ threadId: 'thread-1', messageId: 'msg-1', commitHash: 'hash1', filesChanged: [] });
    s.create({ threadId: 'thread-1', messageId: 'msg-2', commitHash: 'hash2', filesChanged: [] });
    const checkpoints = s.list('thread-1');
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0].commitHash).toBe('hash1');
    expect(checkpoints[1].commitHash).toBe('hash2');
  });

  it('does not leak checkpoints across threads', () => {
    const s = makeStore();
    s.create({ threadId: 'thread-A', messageId: 'msg-1', commitHash: 'hashA', filesChanged: [] });
    s.create({ threadId: 'thread-B', messageId: 'msg-1', commitHash: 'hashB', filesChanged: [] });
    expect(s.list('thread-A')).toHaveLength(1);
    expect(s.list('thread-B')).toHaveLength(1);
    expect(s.list('thread-A')[0].commitHash).toBe('hashA');
    expect(s.list('thread-B')[0].commitHash).toBe('hashB');
  });

  it('returns empty array for unknown thread', () => {
    const s = makeStore();
    expect(s.list('nonexistent')).toEqual([]);
  });
});

describe('CheckpointStore.delete', () => {
  it('deletes a checkpoint by id', () => {
    const s = makeStore();
    const cp = s.create({
      threadId: 'thread-1',
      messageId: 'msg-1',
      commitHash: 'hash1',
      filesChanged: [],
    });
    expect(s.list('thread-1')).toHaveLength(1);
    const deleted = s.delete(cp.id);
    expect(deleted).toBe(true);
    expect(s.list('thread-1')).toHaveLength(0);
  });

  it('returns false for nonexistent id', () => {
    const s = makeStore();
    expect(s.delete('does-not-exist')).toBe(false);
  });
});

describe('CheckpointStore.get', () => {
  it('returns checkpoint by id', () => {
    const s = makeStore();
    const cp = s.create({
      threadId: 'thread-1',
      messageId: 'msg-1',
      commitHash: 'hash1',
      filesChanged: ['a.ts'],
    });
    const fetched = s.get(cp.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.commitHash).toBe('hash1');
    expect(fetched?.filesChanged).toEqual(['a.ts']);
  });

  it('returns null for unknown id', () => {
    const s = makeStore();
    expect(s.get('nope')).toBeNull();
  });
});

describe('CheckpointStore GC (trimToMax)', () => {
  it('trims oldest checkpoints beyond max', () => {
    const s = makeStore();
    const MAX = 5;
    for (let i = 0; i < 7; i++) {
      s.create({
        threadId: 'thread-gc',
        messageId: `msg-${i}`,
        commitHash: `hash${i}`,
        filesChanged: [],
      });
    }
    s.trimToMax('thread-gc', MAX);
    const remaining = s.list('thread-gc');
    expect(remaining).toHaveLength(MAX);
    // Most recent should be kept
    expect(remaining[remaining.length - 1].commitHash).toBe('hash6');
    // Oldest (hash0, hash1) should be gone
    expect(remaining.some((c) => c.commitHash === 'hash0')).toBe(false);
    expect(remaining.some((c) => c.commitHash === 'hash1')).toBe(false);
  });

  it('does nothing when count <= max', () => {
    const s = makeStore();
    s.create({ threadId: 'thread-gc', messageId: 'msg-1', commitHash: 'h1', filesChanged: [] });
    s.trimToMax('thread-gc', 50);
    expect(s.list('thread-gc')).toHaveLength(1);
  });

  it('does not touch other threads during GC', () => {
    const s = makeStore();
    for (let i = 0; i < 3; i++) {
      s.create({
        threadId: 'thread-gc',
        messageId: `msg-${i}`,
        commitHash: `hashgc${i}`,
        filesChanged: [],
      });
    }
    s.create({ threadId: 'thread-safe', messageId: 'msg-1', commitHash: 'safe1', filesChanged: [] });
    s.trimToMax('thread-gc', 2);
    expect(s.list('thread-safe')).toHaveLength(1);
  });
});
