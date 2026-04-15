/**
 * worktreeManagerHelpers.test.ts — Unit tests for pure path helpers and
 * porcelain parser.
 */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseWorktreePorcelain,
  resolveWorktreePath,
  validateWorktreePath,
  WorktreePathError,
} from './worktreeManagerHelpers';

// ─── resolveWorktreePath ──────────────────────────────────────────────────────

describe('resolveWorktreePath', () => {
  it('places worktree as sibling to project under .ouroboros/worktrees', () => {
    const root = '/home/user/myproject';
    const result = resolveWorktreePath(root, 'abc-123');
    // Use path.resolve so the expected value matches the OS-resolved absolute path
    // (on Windows, /home/user resolves to C:\home\user).
    const expected = path.join(path.resolve('/home/user'), '.ouroboros', 'worktrees', 'abc-123');
    expect(result).toBe(expected);
  });

  it('resolves relative project roots before computing sibling', () => {
    const root = '/home/user/myproject/../myproject';
    const result = resolveWorktreePath(root, 'sess-1');
    const expected = path.join(path.resolve('/home/user'), '.ouroboros', 'worktrees', 'sess-1');
    expect(result).toBe(expected);
  });
});

// ─── validateWorktreePath ─────────────────────────────────────────────────────

describe('validateWorktreePath', () => {
  const projectRoot = '/home/user/myproject';

  it('accepts a valid path produced by resolveWorktreePath', () => {
    const wt = resolveWorktreePath(projectRoot, 'sess-abc');
    expect(() => validateWorktreePath(projectRoot, wt)).not.toThrow();
  });

  it('throws WorktreePathError when path uses .. to escape', () => {
    const escaped = path.join(
      '/home/user',
      '.ouroboros',
      'worktrees',
      'sess-abc',
      '..',
      '..',
      '..',
      'evil',
    );
    expect(() => validateWorktreePath(projectRoot, escaped)).toThrow(WorktreePathError);
  });

  it('throws WorktreePathError for an absolute path outside the allowed root', () => {
    expect(() => validateWorktreePath(projectRoot, '/tmp/evil')).toThrow(WorktreePathError);
  });

  it('throws WorktreePathError when path is the project root itself', () => {
    expect(() => validateWorktreePath(projectRoot, projectRoot)).toThrow(WorktreePathError);
  });

  it('throws for a path that is a prefix collision with the allowed root', () => {
    // /home/user/.ouroboros/worktreesExtra should be rejected
    const collision = path.join('/home/user', '.ouroboros', 'worktreesExtra');
    expect(() => validateWorktreePath(projectRoot, collision)).toThrow(WorktreePathError);
  });
});

// ─── parseWorktreePorcelain ───────────────────────────────────────────────────

const SINGLE_WORKTREE = `worktree /home/user/myproject
HEAD abc123def456
branch refs/heads/main

`;

const TWO_WORKTREES = `worktree /home/user/myproject
HEAD abc123def456
branch refs/heads/main

worktree /home/user/.ouroboros/worktrees/sess-1
HEAD def456abc123
branch refs/heads/feature/my-feature

`;

const WITH_BARE = `worktree /home/user/myproject
HEAD abc123
branch refs/heads/main

worktree /home/user/.ouroboros/worktrees/bare-wt
HEAD 000000
bare

`;

const WITH_DETACHED = `worktree /home/user/myproject
HEAD abc123
branch refs/heads/main

worktree /home/user/.ouroboros/worktrees/detached-wt
HEAD deadbeef
detached

`;

describe('parseWorktreePorcelain', () => {
  it('parses a single main worktree', () => {
    const result = parseWorktreePorcelain(SINGLE_WORKTREE);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: '/home/user/myproject',
      head: 'abc123def456',
      branch: 'main',
      isMain: true,
    });
  });

  it('parses two worktrees, marking only the first as main', () => {
    const result = parseWorktreePorcelain(TWO_WORKTREES);
    expect(result).toHaveLength(2);
    expect(result[0].isMain).toBe(true);
    expect(result[1].isMain).toBe(false);
    expect(result[1].branch).toBe('feature/my-feature');
    expect(result[1].path).toBe('/home/user/.ouroboros/worktrees/sess-1');
  });

  it('handles bare worktrees with empty branch', () => {
    const result = parseWorktreePorcelain(WITH_BARE);
    expect(result).toHaveLength(2);
    expect(result[1].branch).toBe('');
    expect(result[1].head).toBe('000000');
  });

  it('handles detached HEAD worktrees with empty branch', () => {
    const result = parseWorktreePorcelain(WITH_DETACHED);
    expect(result).toHaveLength(2);
    expect(result[1].branch).toBe('');
    expect(result[1].head).toBe('deadbeef');
  });

  it('returns empty array for empty stdout', () => {
    expect(parseWorktreePorcelain('')).toEqual([]);
  });

  it('strips refs/heads/ prefix from branch names', () => {
    const result = parseWorktreePorcelain(SINGLE_WORKTREE);
    expect(result[0].branch).toBe('main');
  });
});
