/**
 * settingsFileUtils.test.ts — Unit tests for readSettingsFileWithRetry
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn() },
}));

vi.mock('../logger', () => ({
  default: { warn: vi.fn(), error: vi.fn() },
}));

import fs from 'fs/promises';

import { readSettingsFileWithRetry } from './settingsFileUtils';

const mockReadFile = vi.mocked(fs.readFile);

function makeErrnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(`${code}: mock error`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

beforeEach(() => {
  mockReadFile.mockReset();
  // Make setTimeout fire the callback synchronously so retry delays don't
  // create an async gap where vitest reports intermediate rejections as unhandled.
  vi.spyOn(global, 'setTimeout').mockImplementation((fn) => {
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readSettingsFileWithRetry', () => {
  it('returns parsed JSON on success', async () => {
    mockReadFile.mockResolvedValueOnce('{"mcpServers":{"my-server":{}}}');

    const result = await readSettingsFileWithRetry('/some/settings.json');

    expect(result).toEqual({ mcpServers: { 'my-server': {} } });
  });

  it('returns {} on ENOENT (file not yet created)', async () => {
    mockReadFile.mockRejectedValueOnce(makeErrnoError('ENOENT'));

    const result = await readSettingsFileWithRetry('/missing/settings.json');

    expect(result).toEqual({});
  });

  it('retries on EMFILE and succeeds on second attempt', async () => {
    mockReadFile
      .mockRejectedValueOnce(makeErrnoError('EMFILE'))
      .mockResolvedValueOnce('{"key":"value"}');

    const result = await readSettingsFileWithRetry('/some/settings.json');

    expect(result).toEqual({ key: 'value' });
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  it('retries on ENFILE and succeeds on third attempt', async () => {
    mockReadFile
      .mockRejectedValueOnce(makeErrnoError('ENFILE'))
      .mockRejectedValueOnce(makeErrnoError('ENFILE'))
      .mockResolvedValueOnce('{"a":1}');

    const result = await readSettingsFileWithRetry('/some/settings.json');

    expect(result).toEqual({ a: 1 });
    expect(mockReadFile).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all EMFILE retries', async () => {
    const emfileErr = makeErrnoError('EMFILE');
    // MAX_RETRIES=3 → 4 total attempts (0,1,2,3)
    mockReadFile
      .mockRejectedValueOnce(emfileErr)
      .mockRejectedValueOnce(emfileErr)
      .mockRejectedValueOnce(emfileErr)
      .mockRejectedValueOnce(emfileErr);

    await expect(readSettingsFileWithRetry('/some/settings.json')).rejects.toBe(emfileErr);
    expect(mockReadFile).toHaveBeenCalledTimes(4);
  });

  it('throws immediately on non-retryable, non-ENOENT error', async () => {
    const permErr = makeErrnoError('EACCES');
    mockReadFile.mockRejectedValueOnce(permErr);

    await expect(readSettingsFileWithRetry('/some/settings.json')).rejects.toBe(permErr);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on JSON parse error', async () => {
    mockReadFile.mockResolvedValueOnce('not valid json {{{{');

    await expect(readSettingsFileWithRetry('/some/settings.json')).rejects.toThrow(SyntaxError);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });
});
