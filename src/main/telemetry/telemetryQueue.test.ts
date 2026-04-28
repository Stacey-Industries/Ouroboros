/**
 * telemetryQueue.test.ts — Wave 52 Phase B
 *
 * Verifies the IDE-side append helper:
 *   - records carry recordId / ts / surface / schemaVersion / payload
 *   - recordId is unique across calls
 *   - schemaVersion is preserved verbatim
 *   - surface routes to the correct file
 *   - fs errors do not throw
 *   - per-file cap triggers a rotation rename
 *
 * Mocks `node:fs` fully so the real `~/.ouroboros/telemetry/queue/` is never
 * touched (mirrors the partial-fs mock pattern from
 * mcpSpawnCostTelemetry.test.ts and codemode.internalMcp.integration.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMkdirSync, mockAppendFileSync, mockStatSync, mockExistsSync, mockRenameSync, logWarn } =
  vi.hoisted(() => ({
    mockMkdirSync: vi.fn(),
    mockAppendFileSync: vi.fn(),
    mockStatSync: vi.fn(),
    mockExistsSync: vi.fn(),
    mockRenameSync: vi.fn(),
    logWarn: vi.fn(),
  }));

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: mockMkdirSync,
    appendFileSync: mockAppendFileSync,
    statSync: mockStatSync,
    existsSync: mockExistsSync,
    renameSync: mockRenameSync,
  },
  mkdirSync: mockMkdirSync,
  appendFileSync: mockAppendFileSync,
  statSync: mockStatSync,
  existsSync: mockExistsSync,
  renameSync: mockRenameSync,
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: logWarn, error: vi.fn() },
}));

import { PER_FILE_CAP_BYTES } from './queueRotation';
import { appendToQueue, getQueueDir, type QueueRecord } from './telemetryQueue';

function captureLine(callIndex = 0): QueueRecord {
  // eslint-disable-next-line security/detect-object-injection -- test-only index from a numeric literal
  const args = mockAppendFileSync.mock.calls[callIndex];
  const line = args[1] as string;
  expect(line.endsWith('\n')).toBe(true);
  return JSON.parse(line.trimEnd()) as QueueRecord;
}

beforeEach(() => {
  mockMkdirSync.mockReset();
  mockAppendFileSync.mockReset();
  mockStatSync.mockReset();
  mockExistsSync.mockReset();
  mockRenameSync.mockReset();
  logWarn.mockReset();
  // Default: file does not exist (no rotation); mkdir succeeds.
  mockMkdirSync.mockReturnValue(undefined);
  mockStatSync.mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  mockExistsSync.mockReturnValue(false);
});

afterEach(() => vi.restoreAllMocks());

describe('appendToQueue', () => {
  it('appends a JSONL line with all five fields', () => {
    appendToQueue('spawn-cost', 1, { spawnId: 'sp-1', cost: 42 });
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const record = captureLine();
    expect(typeof record.recordId).toBe('string');
    expect(record.recordId.length).toBeGreaterThan(0);
    expect(typeof record.ts).toBe('number');
    expect(record.surface).toBe('spawn-cost');
    expect(record.schemaVersion).toBe(1);
    expect(record.payload).toEqual({ spawnId: 'sp-1', cost: 42 });
  });

  it('generates a unique recordId per call', () => {
    appendToQueue('spawn-cost', 1, { i: 1 });
    appendToQueue('spawn-cost', 1, { i: 2 });
    appendToQueue('spawn-cost', 1, { i: 3 });
    const ids = new Set([0, 1, 2].map((i) => captureLine(i).recordId));
    expect(ids.size).toBe(3);
  });

  it('preserves schemaVersion verbatim (no coercion)', () => {
    appendToQueue('s', 7, {});
    expect(captureLine().schemaVersion).toBe(7);
  });

  it('uses the surface name in the file path', () => {
    appendToQueue('graph-usage', 1, {});
    const args = mockAppendFileSync.mock.calls[0];
    const filePath = args[0] as string;
    expect(filePath).toContain('graph-usage.jsonl');
    expect(filePath).toContain('queue');
  });

  it('sanitizes surfaces with unsafe path characters', () => {
    appendToQueue('../etc/passwd', 1, {});
    const filePath = mockAppendFileSync.mock.calls[0][0] as string;
    expect(filePath).not.toContain('..');
    expect(filePath).toContain('__etc_passwd.jsonl');
  });

  it('does not throw when mkdir fails', () => {
    mockMkdirSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    expect(() => appendToQueue('s', 1, {})).not.toThrow();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
  });

  it('does not throw when appendFile fails', () => {
    mockAppendFileSync.mockImplementation(() => {
      throw new Error('EIO');
    });
    expect(() => appendToQueue('s', 1, {})).not.toThrow();
    expect(logWarn).toHaveBeenCalled();
  });

  it('rolls the file when current size meets the per-file cap', () => {
    // First stat (rotation gate) — file is at cap.
    mockStatSync.mockReturnValue({ isFile: () => true, size: PER_FILE_CAP_BYTES, mtimeMs: 0 });
    // existsSync used for finding next rollover slot — first slot free.
    mockExistsSync.mockReturnValue(false);
    appendToQueue('spawn-cost', 1, { x: 1 });
    expect(mockRenameSync).toHaveBeenCalledTimes(1);
    const [from, to] = mockRenameSync.mock.calls[0] as [string, string];
    expect(from).toContain('spawn-cost.jsonl');
    expect(to).toMatch(/spawn-cost\.jsonl\.1$/);
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
  });

  it('does not roll when the file is below the cap', () => {
    mockStatSync.mockReturnValue({ isFile: () => true, size: 100, mtimeMs: 0 });
    appendToQueue('spawn-cost', 1, {});
    expect(mockRenameSync).not.toHaveBeenCalled();
  });

  it('tolerates rename failure during rotation (still appends to original)', () => {
    mockStatSync.mockReturnValue({ isFile: () => true, size: PER_FILE_CAP_BYTES, mtimeMs: 0 });
    mockRenameSync.mockImplementation(() => {
      throw new Error('EBUSY');
    });
    expect(() => appendToQueue('s', 1, {})).not.toThrow();
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalled();
  });
});

describe('getQueueDir', () => {
  it('points under .ouroboros/telemetry/queue', () => {
    const dir = getQueueDir();
    expect(dir).toContain('.ouroboros');
    expect(dir).toContain('telemetry');
    expect(dir).toContain('queue');
  });
});
