/**
 * postSpawnRestore.test.ts — Wave 62 Phase D smoke tests.
 *
 * Verifies that firePostSpawnRestore:
 *  - calls restoreAllDisabled for global + project scopes when projectRoot given
 *  - calls restoreAllDisabled for global scope only when projectRoot omitted
 *  - logs a trace entry when files are restored or skipped
 *  - does NOT throw when restoreAllDisabled rejects (crash-safety)
 *  - logs at warn level on error and still resolves
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoist mocks so vi.mock factories can reference them ──────────────────────

const { mockRestoreAllDisabled } = vi.hoisted(() => ({
  mockRestoreAllDisabled: vi.fn(),
}));

const { mockLogInfo, mockLogWarn } = vi.hoisted(() => ({
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
}));

vi.mock('./rulesDirectoryManager', () => ({
  restoreAllDisabled: mockRestoreAllDisabled,
}));

vi.mock('../logger', () => ({
  default: { info: mockLogInfo, warn: mockLogWarn },
}));

// ── Import subject under test (after mocks are registered) ───────────────────

import { firePostSpawnRestore } from './postSpawnRestore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function noop(): { restored: number; skipped: number } {
  return { restored: 0, skipped: 0 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('firePostSpawnRestore', () => {
  beforeEach(() => {
    mockRestoreAllDisabled.mockReset();
    mockLogInfo.mockReset();
    mockLogWarn.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls restoreAllDisabled for global and project when projectRoot is provided', async () => {
    mockRestoreAllDisabled.mockResolvedValue(noop());
    await firePostSpawnRestore('/home/user/myproject');
    expect(mockRestoreAllDisabled).toHaveBeenCalledWith('global');
    expect(mockRestoreAllDisabled).toHaveBeenCalledWith('project', '/home/user/myproject');
    expect(mockRestoreAllDisabled).toHaveBeenCalledTimes(2);
  });

  it('calls restoreAllDisabled only for global when projectRoot is omitted', async () => {
    mockRestoreAllDisabled.mockResolvedValue(noop());
    await firePostSpawnRestore();
    expect(mockRestoreAllDisabled).toHaveBeenCalledWith('global');
    expect(mockRestoreAllDisabled).toHaveBeenCalledTimes(1);
  });

  it('logs [trace:rules-restore] when files are restored', async () => {
    mockRestoreAllDisabled.mockResolvedValue({ restored: 2, skipped: 0 });
    await firePostSpawnRestore('/proj');
    expect(mockLogInfo).toHaveBeenCalledWith(
      '[trace:rules-restore]',
      expect.objectContaining({ trigger: 'post-spawn', restored: 4, skipped: 0 }),
    );
  });

  it('logs [trace:rules-restore] when files are skipped', async () => {
    mockRestoreAllDisabled.mockResolvedValueOnce({ restored: 0, skipped: 1 });
    mockRestoreAllDisabled.mockResolvedValueOnce({ restored: 0, skipped: 0 });
    await firePostSpawnRestore('/proj');
    expect(mockLogInfo).toHaveBeenCalledWith(
      '[trace:rules-restore]',
      expect.objectContaining({ skipped: 1 }),
    );
  });

  it('does NOT log when nothing was restored or skipped', async () => {
    mockRestoreAllDisabled.mockResolvedValue(noop());
    await firePostSpawnRestore();
    expect(mockLogInfo).not.toHaveBeenCalled();
  });

  it('resolves without throwing when restoreAllDisabled rejects', async () => {
    mockRestoreAllDisabled.mockRejectedValue(new Error('disk error'));
    await expect(firePostSpawnRestore('/proj')).resolves.toBeUndefined();
  });

  it('logs a warn (not throw) when restoreAllDisabled rejects', async () => {
    mockRestoreAllDisabled.mockRejectedValue(new Error('disk error'));
    await firePostSpawnRestore('/proj');
    expect(mockLogWarn).toHaveBeenCalledWith(
      '[rules-restore] restore failed — session unaffected:',
      expect.any(Error),
    );
  });
});
