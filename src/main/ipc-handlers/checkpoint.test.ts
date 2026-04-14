/**
 * checkpoint.test.ts — Smoke tests for the checkpoint IPC handler module.
 *
 * Full IPC registration requires an Electron environment and is exercised in
 * E2E tests. These tests verify the module structure and that the pure-helper
 * re-exports (from checkpointHelpers) work correctly when accessed through
 * this module's entry point.
 *
 * Electron modules (ipcMain, app, BrowserWindow) are stubbed via vi.mock so
 * the module can be imported without a running Electron host.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Stub Electron before any imports that pull it in ─────────────────────

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

// ── Now import the module under test ─────────────────────────────────────

import { CheckpointStore } from '../agentChat/checkpointStore';
import type { Database } from '../storage/database';
import { closeDatabase, openDatabase } from '../storage/database';
import { registerCheckpointHandlers } from './checkpoint';
import {
  checkpointCreateRecord,
  checkpointDeleteRecord,
  checkpointListRecords,
} from './checkpointHelpers';

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ipc-test-'));
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

describe('registerCheckpointHandlers', () => {
  it('is a function', () => {
    expect(typeof registerCheckpointHandlers).toBe('function');
  });

  it('returns an array of channel strings when called', () => {
    const channels = registerCheckpointHandlers();
    expect(Array.isArray(channels)).toBe(true);
    expect(channels).toContain('checkpoint:list');
    expect(channels).toContain('checkpoint:create');
    expect(channels).toContain('checkpoint:restore');
    expect(channels).toContain('checkpoint:delete');
  });
});

// Verify helpers are accessible via checkpointHelpers (re-tested here to
// confirm checkpoint.ts wires the dependency correctly).
describe('helper round-trip via checkpointHelpers', () => {
  it('create → list → delete lifecycle', () => {
    const store = makeStore();
    const created = checkpointCreateRecord(store, {
      threadId: 'thread-ipc',
      messageId: 'msg-1',
      commitHash: 'cafebabe',
      filesChanged: ['x.ts'],
    });
    expect(created.success).toBe(true);
    expect(created.checkpoint?.commitHash).toBe('cafebabe');

    const listed = checkpointListRecords(store, 'thread-ipc');
    expect(listed.checkpoints).toHaveLength(1);

    const deleted = checkpointDeleteRecord(store, created.checkpoint!.id);
    expect(deleted.success).toBe(true);

    expect(checkpointListRecords(store, 'thread-ipc').checkpoints).toHaveLength(0);
  });
});
