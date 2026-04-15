/**
 * worktreeManager.ts — git worktree add/remove/list/exists via execFile.
 *
 * All git invocations use child_process.execFile (not shell) with a 30 s
 * timeout.  Disk pre-check via fs.statfs guards against near-full volumes.
 *
 * Exported symbols:
 *   WorktreeRecord, WorktreeManager, LowDiskError, createWorktreeManager
 */

import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import log from '../logger';
import {
  parseWorktreePorcelain,
  resolveWorktreePath,
  validateWorktreePath,
  type WorktreeRecord,
} from './worktreeManagerHelpers';

export type { WorktreeRecord } from './worktreeManagerHelpers';

const execFile = promisify(execFileCb);

// 5 GiB in bytes
const MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;

// ─── Error types ──────────────────────────────────────────────────────────────

export class LowDiskError extends Error {
  constructor(freeGb: number) {
    super(`Insufficient disk space for worktree: ${freeGb.toFixed(1)} GB free, need 5 GB`);
    this.name = 'LowDiskError';
  }
}

// ─── WorktreeManager interface ────────────────────────────────────────────────

export interface WorktreeManager {
  add(projectRoot: string, sessionId: string): Promise<{ path: string }>;
  remove(worktreePath: string): Promise<void>;
  list(projectRoot: string): Promise<WorktreeRecord[]>;
  exists(worktreePath: string): Promise<boolean>;
}

// ─── Disk check ───────────────────────────────────────────────────────────────

async function checkDiskSpace(dirPath: string): Promise<void> {
  try {
    // fs.statfs is available in Node 18+
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statfs = (fs as any).statfs as
      | ((path: string, cb: (err: NodeJS.ErrnoException | null, stats: { bfree: number; bsize: number }) => void) => void)
      | undefined;

    if (typeof statfs !== 'function') {
      log.warn('[worktreeManager] fs.statfs unavailable — skipping disk check');
      return;
    }

    const stats = await new Promise<{ bfree: number; bsize: number }>((resolve, reject) => {
      statfs(dirPath, (err, s) => (err ? reject(err) : resolve(s)));
    });

    const freeBytes = stats.bfree * stats.bsize;
    if (freeBytes < MIN_FREE_BYTES) {
      throw new LowDiskError(freeBytes / (1024 * 1024 * 1024));
    }
  } catch (err) {
    if (err instanceof LowDiskError) throw err;
    // statfs failure (e.g. path doesn't exist yet) — log and continue
    log.warn('[worktreeManager] disk check failed, proceeding:', err);
  }
}

// ─── git helpers ──────────────────────────────────────────────────────────────

async function gitWorktreeAdd(projectRoot: string, wtPath: string): Promise<void> {
  await execFile('git', ['worktree', 'add', wtPath, 'HEAD'], {
    cwd: projectRoot,
    timeout: 30000,
  });
  log.info('[worktreeManager] worktree added', wtPath);
}

async function gitWorktreeRemove(projectRoot: string, wtPath: string): Promise<void> {
  try {
    await execFile('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: projectRoot,
      timeout: 30000,
    });
    log.info('[worktreeManager] worktree removed', wtPath);
  } catch (err: unknown) {
    const code = (err as { code?: number | string }).code;
    // exit 128 means the worktree doesn't exist — tolerate silently
    if (code === 128 || code === '128') {
      log.warn('[worktreeManager] worktree already removed (exit 128)', wtPath);
      return;
    }
    throw err;
  }
}

async function gitWorktreeList(projectRoot: string): Promise<WorktreeRecord[]> {
  const { stdout } = await execFile('git', ['worktree', 'list', '--porcelain'], {
    cwd: projectRoot,
    timeout: 30000,
  });
  return parseWorktreePorcelain(stdout);
}

// ─── resolveProjectRoot: find git root from wtPath for remove ─────────────────

/**
 * Finds the git root of a project for use as cwd in 'git worktree remove'.
 * We derive it from the worktree path itself: walk up until we find .git.
 * Falls back to the worktreePath's parent if the walk fails.
 */
async function resolveGitRoot(wtPath: string): Promise<string> {
  try {
    const { stdout } = await execFile('git', ['rev-parse', '--git-common-dir'], {
      cwd: wtPath,
      timeout: 10000,
    });
    const { dirname, resolve } = await import('node:path');
    const commonDir = stdout.trim();
    // commonDir is typically .git or an absolute path
    return commonDir.startsWith('/') || /^[A-Za-z]:/.test(commonDir)
      ? dirname(commonDir)
      : resolve(wtPath, commonDir, '..');
  } catch {
    const { dirname } = await import('node:path');
    return dirname(wtPath);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createWorktreeManager(): WorktreeManager {
  return {
    async add(projectRoot, sessionId) {
      const wtPath = resolveWorktreePath(projectRoot, sessionId);
      validateWorktreePath(projectRoot, wtPath);
      await checkDiskSpace(projectRoot);
      await gitWorktreeAdd(projectRoot, wtPath);
      return { path: wtPath };
    },

    async remove(worktreePath) {
      const cwd = await resolveGitRoot(worktreePath);
      await gitWorktreeRemove(cwd, worktreePath);
    },

    async list(projectRoot) {
      return gitWorktreeList(projectRoot);
    },

    async exists(worktreePath) {
      try {
        await fs.promises.access(worktreePath, fs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let singleton: WorktreeManager | null = null;

export function getWorktreeManager(): WorktreeManager {
  if (!singleton) {
    singleton = createWorktreeManager();
    log.info('[worktreeManager] singleton created');
  }
  return singleton;
}

export function closeWorktreeManager(): void {
  singleton = null;
}
