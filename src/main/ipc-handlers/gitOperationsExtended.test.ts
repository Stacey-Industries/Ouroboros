/**
 * gitOperationsExtended.test.ts — Unit tests for gitFileAtCommit path containment.
 *
 * Verifies that gitFileAtCommit rejects file paths that escape the repository root
 * before passing them to git, preventing path traversal attacks.
 *
 * Run with: npx vitest run src/main/ipc-handlers/gitOperationsExtended.test.ts
 */

import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron (pulled in transitively by some imports) ────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: () => '/mock/userData',
    getAppPath: () => '/mock/app',
  },
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ── Mock codebaseGraph and contextLayer to avoid native deps ─────────────────
vi.mock('../codebaseGraph/graphController', () => ({ getGraphController: vi.fn() }));
vi.mock('../contextLayer/contextLayerController', () => ({
  getContextLayerController: vi.fn().mockReturnValue(null),
}));
vi.mock('../extensions', () => ({ dispatchActivationEvent: vi.fn() }));

// ── Mock agentChat context cache helper ───────────────────────────────────────
vi.mock('./agentChat', () => ({ invalidateSnapshotCache: vi.fn() }));

// ── Mock gitBlameSnapshot ─────────────────────────────────────────────────────
vi.mock('./gitBlameSnapshot', () => ({
  parseBlameOutput: vi.fn().mockReturnValue([]),
  restoreSnapshot: vi.fn(),
}));

// ── Mock gitDiffParser ────────────────────────────────────────────────────────
vi.mock('./gitDiffParser', () => ({ parseDiffOutput: vi.fn().mockReturnValue([]) }));

// ── Mock gitPatch ─────────────────────────────────────────────────────────────
vi.mock('./gitPatch', () => ({ applyPatch: vi.fn(), stagePatch: vi.fn() }));

// ── Hoist the gitStdout mock so we can control its return value ───────────────
const { mockGitStdout } = vi.hoisted(() => ({ mockGitStdout: vi.fn() }));

// ── Mock gitOperations — replace gitStdout but keep respond/errorMessage ──────
vi.mock('./gitOperations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gitOperations')>();
  return {
    ...actual,
    gitStdout: mockGitStdout,
  };
});

// ── Import module under test AFTER mocks ──────────────────────────────────────
import { gitFileAtCommit } from './gitOperationsExtended';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = process.platform === 'win32' ? 'C:\\repo\\project' : '/repo/project';
const ROOT_RESOLVED = path.resolve(ROOT);
const COMMIT = 'abc1234';

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockGitStdout.mockClear();
  mockGitStdout.mockResolvedValue('file contents');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Path containment checks ──────────────────────────────────────────────────

describe('gitFileAtCommit() — path containment', () => {
  it('succeeds for a file path directly inside the repository root', async () => {
    const filePath = path.join(ROOT_RESOLVED, 'src', 'index.ts');
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, filePath);
    expect(result).toMatchObject({ success: true });
    expect(mockGitStdout).toHaveBeenCalledOnce();
  });

  it('succeeds for a deeply nested file inside the repository root', async () => {
    const filePath = path.join(ROOT_RESOLVED, 'a', 'b', 'c', 'deep.ts');
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, filePath);
    expect(result).toMatchObject({ success: true });
  });

  it('returns { success: false } for a file path outside the repository root', async () => {
    const outside =
      process.platform === 'win32' ? 'C:\\Windows\\system32\\evil.dll' : '/etc/passwd';
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, outside);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/outside the repository root/i);
    expect(mockGitStdout).not.toHaveBeenCalled();
  });

  it('returns { success: false } for a traversal path (../../etc/passwd)', async () => {
    const traversal = path.join(ROOT_RESOLVED, '..', '..', 'etc', 'passwd');
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, traversal);
    expect(result).toMatchObject({ success: false });
    expect(mockGitStdout).not.toHaveBeenCalled();
  });

  it('returns { success: false } for a sibling directory with a similar name', async () => {
    const sibling =
      process.platform === 'win32'
        ? 'C:\\repo\\project-evil\\file.ts'
        : '/repo/project-evil/file.ts';
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, sibling);
    expect(result).toMatchObject({ success: false });
    expect(mockGitStdout).not.toHaveBeenCalled();
  });

  it('returns { success: false } for an absolute path to /tmp', async () => {
    const tmp = process.platform === 'win32' ? 'C:\\Temp\\evil.sh' : '/tmp/evil.sh';
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, tmp);
    expect(result).toMatchObject({ success: false });
    expect(mockGitStdout).not.toHaveBeenCalled();
  });

  it('passes the correct git arguments for an allowed file', async () => {
    const filePath = path.join(ROOT_RESOLVED, 'README.md');
    await gitFileAtCommit(ROOT_RESOLVED, COMMIT, filePath);
    const [calledRoot, calledArgs] = mockGitStdout.mock.calls[0] as [string, string[]];
    expect(calledRoot).toBe(ROOT_RESOLVED);
    expect(calledArgs[0]).toBe('show');
    expect(calledArgs[1]).toContain(COMMIT);
  });

  it('returns { success: true, content } with the content from gitStdout', async () => {
    mockGitStdout.mockResolvedValue('const x = 1;\n');
    const filePath = path.join(ROOT_RESOLVED, 'src', 'x.ts');
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, filePath);
    expect(result).toMatchObject({ success: true, content: 'const x = 1;\n' });
  });
});

// ─── gitStdout failure handling ───────────────────────────────────────────────

describe('gitFileAtCommit() — gitStdout failure fallback', () => {
  it('returns { success: true, content: "" } when gitStdout throws (file not in commit)', async () => {
    mockGitStdout.mockRejectedValue(new Error('fatal: Path not found in commit'));
    const filePath = path.join(ROOT_RESOLVED, 'src', 'gone.ts');
    const result = await gitFileAtCommit(ROOT_RESOLVED, COMMIT, filePath);
    // respond() uses { fallback: { content: '' } } so errors become success with empty content
    expect(result).toMatchObject({ success: true, content: '' });
  });
});
