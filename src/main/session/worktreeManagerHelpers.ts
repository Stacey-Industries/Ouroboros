/**
 * worktreeManagerHelpers.ts — Pure helpers for worktreeManager.
 *
 * Functions:
 *   resolveWorktreePath  — canonical path under .ouroboros/worktrees/<sessionId>
 *   validateWorktreePath — escape-detection guard (symlinks, .., absolute escapes)
 *   parseWorktreePorcelain — parser for `git worktree list --porcelain` output
 *
 * All functions are pure (no I/O) to keep them cheaply testable.
 */

import path from 'node:path';

// ─── Exported error type ──────────────────────────────────────────────────────

export class WorktreePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorktreePathError';
  }
}

// ─── Exported types ───────────────────────────────────────────────────────────

export interface WorktreeRecord {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves the canonical worktree path for a given session.
 * Placed as a sibling to the project root, under .ouroboros/worktrees/.
 *
 * e.g. projectRoot = /home/user/myproject
 *   → /home/user/.ouroboros/worktrees/<sessionId>
 */
export function resolveWorktreePath(projectRoot: string, sessionId: string): string {
  const parent = path.dirname(path.resolve(projectRoot));
  return path.join(parent, '.ouroboros', 'worktrees', sessionId);
}

/**
 * Validates that worktreePath is strictly under
 * path.dirname(projectRoot)/.ouroboros/worktrees/.
 *
 * Throws WorktreePathError on any path escape (relative traversal, symlink
 * tricks, or absolute path outside the allowed root).
 */
export function validateWorktreePath(projectRoot: string, worktreePath: string): void {
  const parent = path.dirname(path.resolve(projectRoot));
  const allowedRoot = path.join(parent, '.ouroboros', 'worktrees');
  const resolved = path.resolve(worktreePath);

  // Ensure resolved path starts with allowedRoot + separator to prevent
  // prefix collisions (e.g. /a/.ouroboros/worktreesExtra).
  const prefix = allowedRoot.endsWith(path.sep) ? allowedRoot : allowedRoot + path.sep;

  if (!resolved.startsWith(prefix) && resolved !== allowedRoot) {
    throw new WorktreePathError(
      `Worktree path escapes allowed root. expected under ${allowedRoot}, got ${resolved}`,
    );
  }
}

// ─── Porcelain parser ─────────────────────────────────────────────────────────

/**
 * Parses the stdout of `git worktree list --porcelain`.
 *
 * Each worktree record is separated by a blank line. Known keys:
 *   worktree, HEAD, branch, bare, detached
 *
 * The first record is always the main worktree (isMain: true).
 */
export function parseWorktreePorcelain(stdout: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = [];
  const blocks = stdout.trim().split(/\n\n+/);

  for (let i = 0; i < blocks.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- numeric index into own array
    const block = blocks[i].trim();
    if (!block) continue;

    const kv = parseBlock(block);
    const wtPath = kv['worktree'] ?? '';
    if (!wtPath) continue;

    records.push({
      path: wtPath,
      head: kv['HEAD'] ?? '',
      branch: kv['branch'] ? stripBranchPrefix(kv['branch']) : '',
      isMain: i === 0,
    });
  }

  return records;
}

function parseBlock(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) {
      // bare / detached flags have no value
      result[line.trim()] = '';
    } else {
      result[line.slice(0, spaceIdx)] = line.slice(spaceIdx + 1);
    }
  }
  return result;
}

function stripBranchPrefix(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}
