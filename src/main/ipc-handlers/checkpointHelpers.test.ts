/**
 * checkpointHelpers.test.ts — Unit tests for checkpoint IPC pure helpers.
 *
 * Tests store-layer logic delegated to by the IPC handlers.
 * IPC registration itself requires Electron and is not tested here.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { CheckpointStore, MAX_CHECKPOINTS_PER_THREAD } from '../agentChat/checkpointStore';
import type { Database } from '../storage/database';
import { closeDatabase, openDatabase } from '../storage/database';
import {
  checkpointCreateRecord,
  checkpointDeleteRecord,
  checkpointListRecords,
} from './checkpointHelpers';

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-handler-test-'));
  return path.join(dir, 'checkpoints.db');
}

let db: Database | null = null;

afterEach(() => {
  closeDatabase(db);
  db = null;
});

function makeStore(): CheckpointStore {
  db = openDatabase(tmpDbPath());
  return new CheckpointStore(db);
}

describe('checkpointCreateRecord', () => {
  it('creates a checkpoint record and returns it', () => {
    const store = makeStore();
    const result = checkpointCreateRecord(store, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      commitHash: 'abcdef',
      filesChanged: ['src/a.ts'],
    });
    expect(result.success).toBe(true);
    expect(result.checkpoint?.commitHash).toBe('abcdef');
    expect(result.checkpoint?.threadId).toBe('thread-1');
  });

  it('applies GC after creation', () => {
    const store = makeStore();
    const MAX = MAX_CHECKPOINTS_PER_THREAD;
    for (let i = 0; i < MAX + 2; i++) {
      checkpointCreateRecord(store, {
        threadId: 'thread-gc',
        messageId: `msg-${i}`,
        commitHash: `hash${i}`,
        filesChanged: [],
      });
    }
    const listResult = checkpointListRecords(store, 'thread-gc');
    expect(listResult.success).toBe(true);
    expect(listResult.checkpoints?.length).toBe(MAX);
  });
});

describe('checkpointListRecords', () => {
  it('returns checkpoints for a thread', () => {
    const store = makeStore();
    checkpointCreateRecord(store, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      commitHash: 'hash1',
      filesChanged: [],
    });
    const result = checkpointListRecords(store, 'thread-1');
    expect(result.success).toBe(true);
    expect(result.checkpoints).toHaveLength(1);
  });

  it('does not return checkpoints for other threads', () => {
    const store = makeStore();
    checkpointCreateRecord(store, {
      threadId: 'thread-A',
      messageId: 'msg-1',
      commitHash: 'hashA',
      filesChanged: [],
    });
    const result = checkpointListRecords(store, 'thread-B');
    expect(result.checkpoints).toHaveLength(0);
  });
});

describe('checkpointDeleteRecord', () => {
  it('deletes an existing checkpoint', () => {
    const store = makeStore();
    const created = checkpointCreateRecord(store, {
      threadId: 'thread-1',
      messageId: 'msg-1',
      commitHash: 'hash1',
      filesChanged: [],
    });
    const checkpointId = created.checkpoint!.id;
    const result = checkpointDeleteRecord(store, checkpointId);
    expect(result.success).toBe(true);
    const listResult = checkpointListRecords(store, 'thread-1');
    expect(listResult.checkpoints).toHaveLength(0);
  });

  it('returns error for nonexistent checkpoint', () => {
    const store = makeStore();
    const result = checkpointDeleteRecord(store, 'no-such-id');
    expect(result.success).toBe(false);
  });
});
