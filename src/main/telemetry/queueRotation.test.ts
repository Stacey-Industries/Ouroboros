/**
 * queueRotation.test.ts — Wave 52 Phase B
 *
 * Per-file cap detection (`shouldRollFile`) and total-dir-cap enforcement
 * (`enforceTotalDirCap`). Uses an in-memory fs mock so tests never touch the
 * real `~/.ouroboros/telemetry/queue/`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReaddirSync, mockStatSync, mockUnlinkSync, logWarn } = vi.hoisted(() => ({
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    unlinkSync: mockUnlinkSync,
  },
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: logWarn, error: vi.fn() },
}));

import {
  enforceTotalDirCap,
  PER_FILE_CAP_BYTES,
  shouldRollFile,
  TOTAL_DIR_CAP_BYTES,
} from './queueRotation';

interface FakeStat {
  name: string;
  size: number;
  mtimeMs: number;
}

function installFakeDir(files: FakeStat[]): void {
  mockReaddirSync.mockReturnValue(files.map((f) => f.name));
  mockStatSync.mockImplementation((p: string) => {
    const name = p.split(/[\\/]/).pop()!;
    const f = files.find((x) => x.name === name);
    if (!f) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    return { isFile: () => true, size: f.size, mtimeMs: f.mtimeMs };
  });
}

beforeEach(() => {
  mockReaddirSync.mockReset();
  mockStatSync.mockReset();
  mockUnlinkSync.mockReset();
  logWarn.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('shouldRollFile', () => {
  it('returns true when file size meets the cap', () => {
    mockStatSync.mockReturnValue({ isFile: () => true, size: PER_FILE_CAP_BYTES, mtimeMs: 0 });
    expect(shouldRollFile('/q/spawn-cost.jsonl')).toBe(true);
  });

  it('returns false when file size is below the cap', () => {
    mockStatSync.mockReturnValue({ isFile: () => true, size: 1024, mtimeMs: 0 });
    expect(shouldRollFile('/q/spawn-cost.jsonl')).toBe(false);
  });

  it('returns false when stat throws (file does not exist)', () => {
    mockStatSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(shouldRollFile('/q/missing.jsonl')).toBe(false);
  });

  it('returns false for non-files (directories)', () => {
    mockStatSync.mockReturnValue({ isFile: () => false, size: 999_999_999, mtimeMs: 0 });
    expect(shouldRollFile('/q/somedir')).toBe(false);
  });
});

describe('enforceTotalDirCap', () => {
  it('is a no-op when total is under the cap', () => {
    installFakeDir([
      { name: 'a.jsonl', size: 1000, mtimeMs: 1 },
      { name: 'b.jsonl', size: 2000, mtimeMs: 2 },
    ]);
    const result = enforceTotalDirCap('/queue');
    expect(result.dropped).toEqual([]);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('returns empty result when readdir throws', () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = enforceTotalDirCap('/missing');
    expect(result.dropped).toEqual([]);
  });

  it('drops oldest-mtime files first until under cap', () => {
    const big = TOTAL_DIR_CAP_BYTES; // exactly the cap, single file
    installFakeDir([
      { name: 'old.jsonl', size: big / 2, mtimeMs: 100 },
      { name: 'mid.jsonl', size: big / 2, mtimeMs: 200 },
      { name: 'new.jsonl', size: big / 2, mtimeMs: 300 },
    ]);
    // Total = 1.5 * cap → must drop the oldest until under.
    const result = enforceTotalDirCap('/queue');
    expect(result.dropped[0]).toBe('old.jsonl');
    expect(mockUnlinkSync).toHaveBeenCalled();
    // Should not unlink 'new.jsonl' since dropping 'old.jsonl' alone brings
    // total to cap (cap == cap is fine per the implementation contract).
    expect(result.dropped).not.toContain('new.jsonl');
  });

  it('continues past unlink failures and reports successes', () => {
    installFakeDir([
      { name: 'a.jsonl', size: TOTAL_DIR_CAP_BYTES, mtimeMs: 1 },
      { name: 'b.jsonl', size: TOTAL_DIR_CAP_BYTES, mtimeMs: 2 },
    ]);
    let calls = 0;
    mockUnlinkSync.mockImplementation(() => {
      calls += 1;
      if (calls === 1) throw new Error('EBUSY');
    });
    const result = enforceTotalDirCap('/queue');
    // First unlink failed; second should have been attempted.
    expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    expect(result.dropped).toEqual(['b.jsonl']);
    expect(logWarn).toHaveBeenCalled();
  });

  it('skips entries whose stat throws', () => {
    mockReaddirSync.mockReturnValue(['ok.jsonl', 'broken.jsonl']);
    mockStatSync.mockImplementation((p: string) => {
      if (p.endsWith('broken.jsonl')) throw new Error('EACCES');
      return { isFile: () => true, size: 1024, mtimeMs: 1 };
    });
    const result = enforceTotalDirCap('/queue');
    expect(result.dropped).toEqual([]);
  });
});
