/**
 * gitOperations.ts — Git command wrappers and operation functions.
 *
 * Extracted from git.ts to keep each file under 300 lines.
 * Parse utilities live in gitParsers.ts.
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

import { getGraphController } from '../codebaseGraph/graphController';
import { getContextLayerController } from '../contextLayer/contextLayerController';
import { dispatchActivationEvent } from '../extensions';
import log from '../logger';
import { invalidateSnapshotCache as invalidateAgentChatCache } from './agentChat';
import {
  getChangedFilesBetween,
  nonEmptyLines,
  parseDiffLines,
  parseLogOutput,
  parseStatusSnapshot,
  toRecord,
} from './gitParsers';
import { applyPatch, stagePatch } from './gitPatch';

// Re-export types and parsers consumed by git.ts
export type {
  ChangedFile,
  DiffLine,
  DiffLineKind,
  DiffStatus,
  GitLogEntry,
  GitResponse,
  ParsedFileDiff,
  ParsedHunk,
  PorcelainStatusEntry,
  StatusSnapshot,
} from './gitParsers';
export { applyPatch, stagePatch };

export const MB = 1024 * 1024;
export const GIT_TIMEOUT_MS = 30_000;

export function gitErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return (err as Error & { stderr?: string }).stderr?.trim() || err.message;
}

export function errorMessage(err: unknown, useGitMessage: boolean = false): string {
  return useGitMessage ? gitErrorMessage(err) : err instanceof Error ? err.message : String(err);
}

export function gitExec(
  args: string[],
  opts: { cwd: string; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { ...opts, timeout: GIT_TIMEOUT_MS, maxBuffer: opts.maxBuffer ?? MB },
      (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr })),
    );
  });
}

export async function gitStdout(
  root: string,
  args: string[],
  maxBuffer: number = MB,
): Promise<string> {
  return (await gitExec(args, { cwd: root, maxBuffer })).stdout;
}

export async function gitTrimmed(
  root: string,
  args: string[],
  maxBuffer?: number,
): Promise<string> {
  return (await gitStdout(root, args, maxBuffer)).trim();
}

type GitResponse<T extends object> = ({ success: true } & T) | { success: false; error: string };

export async function respond<T extends object>(
  work: () => Promise<T>,
  options: { fallback?: T; gitError?: boolean } = {},
): Promise<GitResponse<T>> {
  try {
    return { success: true, ...(await work()) };
  } catch (err: unknown) {
    return options.fallback !== undefined
      ? { success: true, ...options.fallback }
      : { success: false, error: errorMessage(err, options.gitError) };
  }
}

export async function isTracked(root: string, filePath: string): Promise<boolean> {
  try {
    await gitExec(['ls-files', '--error-unmatch', filePath], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

export async function getDirtyCount(root: string): Promise<number> {
  return nonEmptyLines(await gitStdout(root, ['status', '--porcelain'])).length;
}

export async function discardFile(
  root: string,
  filePath: string,
): Promise<GitResponse<Record<string, never>>> {
  const empty: Record<string, never> = {};
  if (await isTracked(root, filePath)) {
    return respond(
      async () => {
        await gitExec(['checkout', 'HEAD', '--', filePath], { cwd: root });
        return empty;
      },
      { gitError: true },
    );
  }
  return respond(async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by assertPathAllowed in registerSecure before reaching discardFile
    await fs.unlink(path.resolve(root, filePath));
    return empty;
  });
}

export function gitIsRepo(root: string) {
  return respond(
    async () => {
      await gitExec(['rev-parse', '--git-dir'], { cwd: root });
      return { isRepo: true };
    },
    { fallback: { isRepo: false } },
  );
}

export function gitStatus(root: string) {
  return respond(async () => ({
    files: toRecord(parseStatusSnapshot(await gitStdout(root, ['status', '--porcelain=v1'])).files),
  }));
}

export function gitBranch(root: string) {
  return respond(async () => ({
    branch: await gitTrimmed(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
  }));
}

export function gitDiff(root: string, filePath: string) {
  return respond(
    async () => ({
      lines: parseDiffLines(await gitStdout(root, ['diff', 'HEAD', '--', filePath], 4 * MB)),
    }),
    { fallback: { lines: [] } },
  );
}

export function gitLog(root: string, filePath: string, offset: number = 0) {
  return respond(async () => ({
    commits: parseLogOutput(
      await gitStdout(
        root,
        [
          'log',
          '--pretty=format:%H|%an|%ae|%ad|%s',
          '--date=short',
          '-n',
          '50',
          `--skip=${offset}`,
          '--',
          filePath,
        ],
        2 * MB,
      ),
    ),
  }));
}

export function gitShow(root: string, hash: string, filePath: string) {
  return respond(async () => ({
    patch: await gitStdout(root, ['show', hash, '--', filePath], 4 * MB),
  }));
}

export function gitBranches(root: string) {
  return respond(async () => ({
    branches: nonEmptyLines(
      await gitStdout(root, ['branch', '-a', '--format=%(refname:short)']),
    ).map((b) => b.trim()),
  }));
}

export function gitCheckout(root: string, branch: string) {
  return respond(
    async () => {
      await gitExec(['checkout', branch], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}

export function gitStage(root: string, filePath: string) {
  return respond(
    async () => {
      await gitExec(['add', filePath], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}

export function gitUnstage(root: string, filePath: string) {
  return respond(
    async () => {
      await gitExec(['restore', '--staged', filePath], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}

export function gitStatusDetailed(root: string) {
  return respond(async () => {
    const snapshot = parseStatusSnapshot(await gitStdout(root, ['status', '--porcelain=v1']));
    return { staged: toRecord(snapshot.staged), unstaged: toRecord(snapshot.unstaged) };
  });
}

export function gitCommit(root: string, message: string) {
  return respond(
    async () => {
      await gitExec(['commit', '-m', message], { cwd: root });
      dispatchActivationEvent('onGitCommit', { root, message }).catch((error) => {
        log.error('Failed to dispatch onGitCommit activation event:', error);
      });
      getGraphController()?.onGitCommit();
      getContextLayerController()?.onGitCommit();
      invalidateAgentChatCache();
      return {};
    },
    { gitError: true },
  );
}

export function gitStageAll(root: string) {
  return respond(
    async () => {
      await gitExec(['add', '-A'], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}

export function gitUnstageAll(root: string) {
  return respond(
    async () => {
      await gitExec(['reset', 'HEAD'], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}

export function gitChangedFilesBetween(root: string, fromHash: string, toHash: string) {
  return respond(async () => ({
    files: await getChangedFilesBetween({ root, fromHash, toHash, gitStdout, MB }),
  }));
}

// Extended git operations — defined in gitOperationsExtended.ts, re-exported here for backward compatibility
export {
  gitBlame,
  gitCreateSnapshot,
  gitDiffBetween,
  gitDiffCached,
  gitDiffRaw,
  gitDiffReview,
  gitDirtyCount,
  gitFileAtCommit,
  gitRestoreSnapshot,
  gitRevertFile,
  gitSnapshot,
} from './gitOperationsExtended';
