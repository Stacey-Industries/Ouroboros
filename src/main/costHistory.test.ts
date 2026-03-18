/**
 * costHistory.test.ts
 *
 * Since costHistory.ts uses `app.getPath('userData')` from electron,
 * we mock the electron module and test the core logic.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;

// Mock electron.app before importing the module under test
vi.mock('electron', () => ({
  app: {
    getPath: () => tmpDir,
  },
}));

// Import AFTER mock setup
import type { CostEntry } from './costHistory';
import {
  clearCostHistory,
  closeCostHistoryDb,
  getCostHistory,
  loadCostHistory,
  saveCostEntry,
} from './costHistory';

function makeEntry(sessionId: string, timestamp = Date.now()): CostEntry {
  return {
    date: '2026-03-18',
    sessionId,
    taskLabel: 'test task',
    model: 'claude-sonnet-4-6',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    estimatedCost: 0.01,
    timestamp,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-test-'));
});

afterEach(() => {
  closeCostHistoryDb();
});

// eslint-disable-next-line max-lines-per-function
describe('costHistory', () => {
  it('saves and retrieves an entry', async () => {
    await saveCostEntry(makeEntry('s1'));
    const entries = await getCostHistory();
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe('s1');
  });

  it('deduplicates by sessionId', async () => {
    await saveCostEntry(makeEntry('s1'));
    await saveCostEntry(makeEntry('s1'));
    const entries = await getCostHistory();
    expect(entries).toHaveLength(1);
  });

  it('returns entries sorted by timestamp descending', async () => {
    await saveCostEntry(makeEntry('s1', 1000));
    await saveCostEntry(makeEntry('s2', 2000));
    await saveCostEntry(makeEntry('s3', 1500));
    const entries = await getCostHistory();
    expect(entries.map((e) => e.sessionId)).toEqual(['s2', 's3', 's1']);
  });

  it('clearCostHistory removes all entries', async () => {
    await saveCostEntry(makeEntry('s1'));
    await saveCostEntry(makeEntry('s2'));
    await clearCostHistory();
    const entries = await getCostHistory();
    expect(entries).toHaveLength(0);
  });

  it('loadCostHistory returns { entries }', async () => {
    await saveCostEntry(makeEntry('s1'));
    const result = await loadCostHistory();
    expect(result.entries).toHaveLength(1);
  });

  it('preserves all fields', async () => {
    const entry = makeEntry('s1');
    await saveCostEntry(entry);
    const [loaded] = await getCostHistory();
    expect(loaded.date).toBe(entry.date);
    expect(loaded.taskLabel).toBe(entry.taskLabel);
    expect(loaded.model).toBe(entry.model);
    expect(loaded.inputTokens).toBe(entry.inputTokens);
    expect(loaded.outputTokens).toBe(entry.outputTokens);
    expect(loaded.cacheReadTokens).toBe(entry.cacheReadTokens);
    expect(loaded.cacheWriteTokens).toBe(entry.cacheWriteTokens);
    expect(loaded.estimatedCost).toBe(entry.estimatedCost);
    expect(loaded.timestamp).toBe(entry.timestamp);
  });
});
