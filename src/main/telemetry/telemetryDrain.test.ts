/**
 * telemetryDrain.test.ts — Wave 52 Phase B
 *
 * Behaviour:
 *   - happy path: queue file → atomic-move → handler dispatch → delete
 *   - parse errors are logged + skipped, file retained
 *   - unknown surface logged + skipped, file retained
 *   - unknown schemaVersion logged + skipped, file retained
 *   - handler throws: errored++, file retained
 *   - mixed results retain the processed file (don't re-dispatch on next drain)
 *   - idempotency: a second drain over an empty queue is a no-op
 *   - dispatches every record before moving on to the next file
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMkdirSync,
  mockReaddirSync,
  mockRenameSync,
  mockReadFileSync,
  mockUnlinkSync,
  logWarn,
  logInfo,
} = vi.hoisted(() => ({
  mockMkdirSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockRenameSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    readdirSync: mockReaddirSync,
    renameSync: mockRenameSync,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
  },
  mkdirSync: mockMkdirSync,
  readdirSync: mockReaddirSync,
  renameSync: mockRenameSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock('../logger', () => ({
  default: { info: logInfo, warn: logWarn, error: vi.fn() },
}));

import { clearSurfaceHandlersForTest, drainQueue, registerSurfaceHandler } from './telemetryDrain';
import type { QueueRecord } from './telemetryQueue';

function record(overrides: Partial<QueueRecord> = {}): QueueRecord {
  return {
    recordId: 'rec-' + Math.random().toString(36).slice(2),
    ts: 1_700_000_000_000,
    surface: 'spawn-cost',
    schemaVersion: 1,
    payload: { hello: 'world' },
    ...overrides,
  };
}

function jsonl(...recs: QueueRecord[]): string {
  return recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

beforeEach(() => {
  mockMkdirSync.mockReset();
  mockReaddirSync.mockReset();
  mockRenameSync.mockReset();
  mockReadFileSync.mockReset();
  mockUnlinkSync.mockReset();
  logWarn.mockReset();
  logInfo.mockReset();
  clearSurfaceHandlersForTest();
  mockMkdirSync.mockReturnValue(undefined);
  mockRenameSync.mockReturnValue(undefined);
  mockUnlinkSync.mockReturnValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('drainQueue happy path', () => {
  it('dispatches every record then deletes the processed file', async () => {
    const handler = vi.fn();
    registerSurfaceHandler('spawn-cost', handler, [1]);
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue(jsonl(record(), record(), record()));
    const summary = await drainQueue();
    expect(summary).toEqual({
      filesProcessed: 1,
      recordsImported: 3,
      recordsSkipped: 0,
      recordsErrored: 0,
    });
    expect(handler).toHaveBeenCalledTimes(3);
    expect(mockRenameSync).toHaveBeenCalledTimes(1);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
  });

  it('handles rotated files (.jsonl.<n>)', async () => {
    const handler = vi.fn();
    registerSurfaceHandler('spawn-cost', handler, [1]);
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl', 'spawn-cost.jsonl.1']);
    mockReadFileSync.mockReturnValue(jsonl(record()));
    const summary = await drainQueue();
    expect(summary.filesProcessed).toBe(2);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('ignores non-queue filenames', async () => {
    registerSurfaceHandler('spawn-cost', vi.fn(), [1]);
    mockReaddirSync.mockReturnValue(['README.md', '.gitkeep']);
    const summary = await drainQueue();
    expect(summary.filesProcessed).toBe(0);
    expect(mockRenameSync).not.toHaveBeenCalled();
  });
});

describe('drainQueue forward compatibility', () => {
  it('skips records with unknown surface and retains the file', async () => {
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue(jsonl(record({ surface: 'mystery' })));
    const summary = await drainQueue();
    expect(summary.recordsSkipped).toBe(1);
    expect(summary.recordsImported).toBe(0);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
  });

  it('skips records with unsupported schemaVersion and retains the file', async () => {
    const handler = vi.fn();
    registerSurfaceHandler('spawn-cost', handler, [1]);
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue(jsonl(record({ schemaVersion: 99 })));
    const summary = await drainQueue();
    expect(summary.recordsSkipped).toBe(1);
    expect(handler).not.toHaveBeenCalled();
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('accepts any version when supportedVersions is empty', async () => {
    const handler = vi.fn();
    registerSurfaceHandler('spawn-cost', handler);
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue(jsonl(record({ schemaVersion: 17 })));
    const summary = await drainQueue();
    expect(summary.recordsImported).toBe(1);
  });
});

describe('drainQueue malformed records', () => {
  it('skips lines that fail JSON.parse', async () => {
    const handler = vi.fn();
    registerSurfaceHandler('spawn-cost', handler, [1]);
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue('not-json\n' + JSON.stringify(record()) + '\n');
    const summary = await drainQueue();
    expect(summary.recordsSkipped).toBe(1);
    expect(summary.recordsImported).toBe(1);
    // Mixed: file retained.
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('skips lines that parse but lack required fields', async () => {
    registerSurfaceHandler('spawn-cost', vi.fn(), [1]);
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue('{"foo":1}\n');
    const summary = await drainQueue();
    expect(summary.recordsSkipped).toBe(1);
  });
});

describe('drainQueue handler errors', () => {
  it('counts handler throws as errored and retains the file', async () => {
    registerSurfaceHandler(
      'spawn-cost',
      () => {
        throw new Error('boom');
      },
      [1],
    );
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue(jsonl(record(), record()));
    const summary = await drainQueue();
    expect(summary.recordsErrored).toBe(2);
    expect(summary.recordsImported).toBe(0);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('continues to subsequent records after a per-record failure', async () => {
    let calls = 0;
    registerSurfaceHandler(
      'spawn-cost',
      () => {
        calls += 1;
        if (calls === 1) throw new Error('first fail');
      },
      [1],
    );
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockReadFileSync.mockReturnValue(jsonl(record(), record(), record()));
    const summary = await drainQueue();
    expect(summary.recordsErrored).toBe(1);
    expect(summary.recordsImported).toBe(2);
  });
});

describe('drainQueue idempotency', () => {
  it('is a no-op when the queue is empty', async () => {
    mockReaddirSync.mockReturnValue([]);
    const summary = await drainQueue();
    expect(summary.filesProcessed).toBe(0);
    expect(mockRenameSync).not.toHaveBeenCalled();
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('does not re-dispatch records from already-processed files', async () => {
    // Second drain sees an empty queue (the first drain already moved/deleted
    // anything from the first pass). The drain only reads from queue/, never
    // from processed/, so this is the structural guarantee.
    const handler = vi.fn();
    registerSurfaceHandler('spawn-cost', handler, [1]);
    mockReaddirSync.mockReturnValueOnce(['spawn-cost.jsonl']).mockReturnValueOnce([]);
    mockReadFileSync.mockReturnValue(jsonl(record()));
    const first = await drainQueue();
    const second = await drainQueue();
    expect(first.recordsImported).toBe(1);
    expect(second.filesProcessed).toBe(0);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('drainQueue rename failures', () => {
  it('skips a file when atomic move fails (no double-import on retry)', async () => {
    const handler = vi.fn();
    registerSurfaceHandler('spawn-cost', handler, [1]);
    mockReaddirSync.mockReturnValue(['spawn-cost.jsonl']);
    mockRenameSync.mockImplementation(() => {
      throw new Error('EBUSY');
    });
    const summary = await drainQueue();
    expect(summary.filesProcessed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
  });
});
