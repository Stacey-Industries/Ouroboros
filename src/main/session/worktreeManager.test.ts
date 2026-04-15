/**
 * worktreeManager.test.ts — Unit tests for WorktreeManager.
 *
 * Mocks execFile and fs.access/statfs so no git binary is needed.
 */

import fs from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock child_process.execFile ──────────────────────────────────────────────

const mockExecFile = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (
    cmd: string,
    args: string[],
    opts: unknown,
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    // promisify wraps the callback form — we expose the raw callback shim
    const result = mockExecFile(cmd, args, opts);
    if (result instanceof Error) {
      cb(result, { stdout: '', stderr: '' });
    } else {
      cb(null, { stdout: result ?? '', stderr: '' });
    }
    return {} as ReturnType<typeof import('node:child_process').execFile>;
  },
}));

// ─── Mock fs.promises.access and fs.statfs ────────────────────────────────────

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        access: vi.fn(),
      },
      constants: actual.constants,
      statfs: vi.fn(),
    },
  };
});

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { createWorktreeManager,LowDiskError } from './worktreeManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = 'C:\\repos\\myproject';
const SESSION_ID = 'test-session-uuid-1234';

function makeDiskStats(freeGb: number) {
  // bsize=4096, bfree = desired free bytes / 4096
  const bsize = 4096;
  const freeBytes = freeGb * 1024 * 1024 * 1024;
  return { bsize, bfree: Math.floor(freeBytes / bsize) };
}

function setupDiskMock(freeGb: number) {
  const mockFs = fs as unknown as {
    statfs: ReturnType<typeof vi.fn>;
  };
  mockFs.statfs.mockImplementation(
    (_path: string, cb: (err: null, stats: { bsize: number; bfree: number }) => void) => {
      cb(null, makeDiskStats(freeGb));
    },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorktreeManager.add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDiskMock(10); // 10 GB free by default
  });

  it('resolves worktree path and returns it on success', async () => {
    // git worktree add succeeds
    mockExecFile.mockReturnValue('');

    const manager = createWorktreeManager();
    const result = await manager.add(PROJECT_ROOT, SESSION_ID);

    expect(result.path).toContain(SESSION_ID);
    expect(result.path).toContain('.ouroboros');
    // confirm git was called with execFile (not shell)
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'add']),
      expect.objectContaining({ timeout: 30000 }),
    );
  });

  it('throws LowDiskError when free space < 5 GB', async () => {
    setupDiskMock(4); // 4 GB — below threshold

    const manager = createWorktreeManager();
    await expect(manager.add(PROJECT_ROOT, SESSION_ID)).rejects.toThrow(LowDiskError);
    // git should never be called
    expect(mockExecFile).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'add']),
      expect.anything(),
    );
  });
});

describe('WorktreeManager.remove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls git worktree remove --force', async () => {
    // First call: git rev-parse --git-common-dir, second: git worktree remove
    mockExecFile
      .mockReturnValueOnce('C:\\repos\\myproject\\.git')
      .mockReturnValueOnce('');

    const manager = createWorktreeManager();
    await manager.remove('C:\\repos\\.ouroboros\\worktrees\\sess-1');

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'remove', '--force']),
      expect.objectContaining({ timeout: 30000 }),
    );
  });

  it('tolerates git exit code 128 (already removed) without throwing', async () => {
    mockExecFile.mockReturnValueOnce('C:\\repos\\myproject\\.git');
    const err = Object.assign(new Error('not a worktree'), { code: 128 });
    mockExecFile.mockReturnValueOnce(err);

    const manager = createWorktreeManager();
    await expect(
      manager.remove('C:\\repos\\.ouroboros\\worktrees\\sess-1'),
    ).resolves.toBeUndefined();
  });

  it('re-throws errors other than exit 128', async () => {
    mockExecFile.mockReturnValueOnce('C:\\repos\\myproject\\.git');
    const err = Object.assign(new Error('fatal git error'), { code: 1 });
    mockExecFile.mockReturnValueOnce(err);

    const manager = createWorktreeManager();
    await expect(
      manager.remove('C:\\repos\\.ouroboros\\worktrees\\sess-1'),
    ).rejects.toThrow('fatal git error');
  });
});

describe('WorktreeManager.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed worktree records', async () => {
    const porcelain = [
      'worktree C:\\repos\\myproject',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree C:\\repos\\.ouroboros\\worktrees\\sess-1',
      'HEAD def456',
      'branch refs/heads/feat',
      '',
    ].join('\n');

    mockExecFile.mockReturnValue(porcelain);

    const manager = createWorktreeManager();
    const records = await manager.list(PROJECT_ROOT);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ branch: 'main', isMain: true });
    expect(records[1]).toMatchObject({ branch: 'feat', isMain: false });
  });
});

describe('WorktreeManager.exists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when fs.access resolves', async () => {
    vi.mocked(fs.promises.access).mockResolvedValue(undefined);

    const manager = createWorktreeManager();
    expect(await manager.exists('/some/path')).toBe(true);
  });

  it('returns false when fs.access rejects', async () => {
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('ENOENT'));

    const manager = createWorktreeManager();
    expect(await manager.exists('/missing/path')).toBe(false);
  });
});
