/**
 * crashReporterStorage.test.ts — Unit tests for crash record persistence.
 *
 * Covers:
 *   - writeCrashRecord creates the directory and writes a JSON file
 *   - getCrashReportDirPath returns a path rooted at homedir
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { CrashRecord } from './crashReporter';
import { getCrashReportDirPath, writeCrashRecord } from './crashReporterStorage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSampleRecord(overrides: Partial<CrashRecord> = {}): CrashRecord {
  return {
    timestamp: '2026-04-17T12:00:00.000Z',
    version: '2.5.0',
    os: 'linux',
    osVersion: '5.15.0',
    nodeVersion: 'v20.0.0',
    message: 'Test error',
    stack: 'Error: Test error\n    at <anonymous>:1:1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getCrashReportDirPath
// ---------------------------------------------------------------------------

describe('getCrashReportDirPath', () => {
  it('returns a path rooted at os.homedir()', () => {
    const dir = getCrashReportDirPath();
    expect(dir.startsWith(os.homedir())).toBe(true);
  });

  it('includes .ouroboros/crash-reports segments', () => {
    const dir = getCrashReportDirPath();
    expect(dir).toContain('.ouroboros');
    expect(dir).toContain('crash-reports');
  });
});

// ---------------------------------------------------------------------------
// writeCrashRecord
// ---------------------------------------------------------------------------

describe('writeCrashRecord', () => {
  let tmpDir: string;
  let mkdirSpy: ReturnType<typeof vi.spyOn>;
  let writeFileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), 'ouroboros-test-crashes');

    mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    // Redirect getCrashReportDirPath → tmpDir by mocking os.homedir
    vi.spyOn(os, 'homedir').mockReturnValue(
      tmpDir.replace(path.join('.ouroboros', 'crash-reports'), ''),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the crash-reports directory recursively', async () => {
    const record = makeSampleRecord();
    await writeCrashRecord(record);
    expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('crash-reports'), {
      recursive: true,
    });
  });

  it('writes a JSON file named after the timestamp', async () => {
    // Timestamp uses ISO format; writeCrashRecord sanitises : and . → - for the filename.
    // Input:    '2026-04-17T12:00:00.000Z'  (standard ISO)
    // Filename: '2026-04-17T12-00-00-000Z'  (colons + dot replaced)
    const record = makeSampleRecord({ timestamp: '2026-04-17T12:00:00.000Z' });
    await writeCrashRecord(record);
    const [writePath, content] = writeFileSpy.mock.calls[0] as [string, string, string];
    // The sanitised timestamp should appear in the path
    expect(writePath).toMatch(/2026-04-17T12/);
    expect(writePath).toMatch(/\.json$/);
    const parsed = JSON.parse(content) as CrashRecord;
    expect(parsed.version).toBe('2.5.0');
    expect(parsed.message).toBe('Test error');
  });

  it('serialises the full crash record as JSON', async () => {
    const record = makeSampleRecord({ stack: 'Error: boom\n    at foo.ts:1' });
    await writeCrashRecord(record);
    const [, content] = writeFileSpy.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as CrashRecord;
    expect(parsed.stack).toContain('boom');
    expect(parsed.os).toBe('linux');
    expect(parsed.nodeVersion).toBe('v20.0.0');
  });
});
