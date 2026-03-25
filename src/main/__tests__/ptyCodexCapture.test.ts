import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — factories must be self-contained (no outer variable references).
// vi.mock is hoisted above all imports, so captured vars are not yet initialised.
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readdir: vi.fn(),
      open: vi.fn(),
    },
  },
}));

vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
  },
}));

vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import os from 'node:os';
import readline from 'node:readline';

import {
  extractThreadIdFromFilename,
  extractTimestampFromFilename,
  resolveCodexThreadId,
} from '../ptyCodexCapture';

// Typed references to the mocked functions
const mockReaddir = vi.mocked(fs.promises.readdir);
const mockOpen = vi.mocked(fs.promises.open);
const mockHomedir = vi.mocked(os.homedir);
const mockCreateInterface = vi.mocked(readline.createInterface);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SAMPLE_UUID_2 = 'deadbeef-0000-1111-2222-333344445555';
const SAMPLE_DATETIME = '2026-03-21T00-30-01';
const SAMPLE_FILENAME = `rollout-${SAMPLE_DATETIME}-${SAMPLE_UUID}.jsonl`;

/**
 * Wires fs.open + readline.createInterface so that readRolloutCwd (the private
 * helper inside the module) returns `line` as the first JSONL line of the file.
 */
function mockRolloutFirstLine(line: string): void {
  const mockStream = {};
  const mockFileHandle = {
    createReadStream: vi.fn(() => mockStream),
    close: vi.fn().mockResolvedValue(undefined),
  };

  mockOpen.mockResolvedValueOnce(mockFileHandle as never);

  mockCreateInterface.mockImplementationOnce(() => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

    return {
      once(event: string, cb: (...args: unknown[]) => void) {
        if (!handlers[event]) handlers[event] = []; // eslint-disable-line security/detect-object-injection
        handlers[event].push(cb); // eslint-disable-line security/detect-object-injection
        // Emit 'line' synchronously when the listener is registered
        if (event === 'line') {
          cb(line);
        }
        return this;
      },
      close() {
        (handlers['close'] ?? []).forEach((cb) => cb());
      },
    } as never;
  });
}

// ---------------------------------------------------------------------------
// extractThreadIdFromFilename
// ---------------------------------------------------------------------------

describe('extractThreadIdFromFilename', () => {
  it('extracts UUID from a valid rollout filename', () => {
    expect(extractThreadIdFromFilename(SAMPLE_FILENAME)).toBe(SAMPLE_UUID);
  });

  it('extracts a different UUID from another valid rollout filename', () => {
    const filename = `rollout-2025-12-01T10-00-00-${SAMPLE_UUID_2}.jsonl`;
    expect(extractThreadIdFromFilename(filename)).toBe(SAMPLE_UUID_2);
  });

  it('returns null for a non-rollout filename', () => {
    expect(extractThreadIdFromFilename('session-info.jsonl')).toBeNull();
  });

  it('returns null when the .jsonl extension is missing', () => {
    expect(extractThreadIdFromFilename(`rollout-${SAMPLE_DATETIME}-${SAMPLE_UUID}`)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractThreadIdFromFilename('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractTimestampFromFilename
// ---------------------------------------------------------------------------

describe('extractTimestampFromFilename', () => {
  it('returns the correct Unix ms timestamp for a valid rollout filename', () => {
    const expected = Date.parse('2026-03-21T00:30:01');
    expect(extractTimestampFromFilename(SAMPLE_FILENAME)).toBe(expected);
  });

  it('converts time-portion dashes to colons before parsing', () => {
    // 13-05-59 must become 13:05:59 — verify the colon conversion specifically
    const filename = `rollout-2025-01-15T13-05-59-${SAMPLE_UUID}.jsonl`;
    expect(extractTimestampFromFilename(filename)).toBe(Date.parse('2025-01-15T13:05:59'));
  });

  it('returns null for a non-rollout filename', () => {
    expect(extractTimestampFromFilename('session-info.jsonl')).toBeNull();
  });

  it('returns null for a malformed datetime segment', () => {
    // The regex requires \d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2} — this won't match
    expect(extractTimestampFromFilename(`rollout-NOT-A-DATE-${SAMPLE_UUID}.jsonl`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveCodexThreadId
// ---------------------------------------------------------------------------

describe('resolveCodexThreadId', () => {
  // spawnedAfter is 00:29:00, file timestamp is 00:30:01 — file is newer
  const SPAWN_TS = Date.parse('2026-03-21T00:29:00');
  const CWD = '/home/testuser/projects/my-app';

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { success: true } (no threadId) when the sessions directory does not exist', async () => {
    mockReaddir.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
    );

    const result = await resolveCodexThreadId({ cwd: CWD, spawnedAfter: SPAWN_TS });

    expect(result).toEqual({ success: true });
    expect(result.threadId).toBeUndefined();
  });

  it('returns { success: true } (no threadId) when directory exists but no files match', async () => {
    // File timestamp 00:10:00 is before spawnedAfter 00:29:00 — filtered out
    const oldFilename = `rollout-2026-03-21T00-10-00-${SAMPLE_UUID}.jsonl`;
    mockReaddir.mockResolvedValueOnce([oldFilename] as never);

    const result = await resolveCodexThreadId({ cwd: CWD, spawnedAfter: SPAWN_TS });

    expect(result).toEqual({ success: true });
    expect(result.threadId).toBeUndefined();
  });

  it('returns { success: true, threadId } when a matching rollout file is found', async () => {
    mockReaddir.mockResolvedValueOnce([SAMPLE_FILENAME] as never);
    mockRolloutFirstLine(JSON.stringify({ payload: { cwd: CWD } }));

    const result = await resolveCodexThreadId({ cwd: CWD, spawnedAfter: SPAWN_TS });

    expect(result).toEqual({ success: true, threadId: SAMPLE_UUID });
  });

  it('returns { success: true } (no threadId) when CWD in the file does not match', async () => {
    mockReaddir.mockResolvedValueOnce([SAMPLE_FILENAME] as never);
    mockRolloutFirstLine(JSON.stringify({ payload: { cwd: '/home/testuser/other-project' } }));

    const result = await resolveCodexThreadId({ cwd: CWD, spawnedAfter: SPAWN_TS });

    expect(result).toEqual({ success: true });
    expect(result.threadId).toBeUndefined();
  });

  it('matches CWD case-insensitively on Windows', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    mockReaddir.mockResolvedValueOnce([SAMPLE_FILENAME] as never);

    // File stores uppercase path; caller passes lowercase — must still match on win32
    const upperCwd = 'C:\\Users\\TestUser\\Projects\\My-App';
    const lowerCwd = 'c:\\users\\testuser\\projects\\my-app';
    mockRolloutFirstLine(JSON.stringify({ payload: { cwd: upperCwd } }));

    const result = await resolveCodexThreadId({ cwd: lowerCwd, spawnedAfter: SPAWN_TS });

    expect(result.success).toBe(true);
    expect(result.threadId).toBe(SAMPLE_UUID);

    platformSpy.mockRestore();
  });
});
