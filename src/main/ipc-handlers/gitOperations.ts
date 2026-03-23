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
import { invalidateSnapshotCache as invalidateAgentChatCache } from './agentChat';
import { parseBlameOutput, restoreSnapshot } from './gitBlameSnapshot';
import {
  getChangedFilesBetween,
  nonEmptyLines,
  normalizeGitPath,
  parseDiffLines,
  parseDiffOutput,
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

export async function gitStdout(root: string, args: string[], maxBuffer: number = MB): Promise<string> {
  return (await gitExec(args, { cwd: root, maxBuffer })).stdout;
}

export async function gitTrimmed(root: string, args: string[], maxBuffer?: number): Promise<string> {
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

export async function discardFile(root: string, filePath: string): Promise<GitResponse<Record<string, never>>> {
  if (await isTracked(root, filePath)) {
    return respond(
      async () => { await gitExec(['checkout', 'HEAD', '--', filePath], { cwd: root }); return {}; },
      { gitError: true },
    );
  }
  return respond(async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by assertPathAllowed in registerSecure before reaching discardFile
    await fs.unlink(path.resolve(root, filePath));
    return {};
  });
}

export function gitIsRepo(root: string) {
  return respond(
    async () => { await gitExec(['rev-parse', '--git-dir'], { cwd: root }); return { isRepo: true }; },
    { fallback: { isRepo: false } },
  );
}

export function gitStatus(root: string) {
  return respond(async () => ({
    files: toRecord(parseStatusSnapshot(await gitStdout(root, ['status', '--porcelain=v1'])).files),
  }));
}

export function gitBranch(root: string) {
  return respond(async () => ({ branch: await gitTrimmed(root, ['rev-parse', '--abbrev-ref', 'HEAD']) }));
}

export function gitDiff(root: string, filePath: string) {
  return respond(
    async () => ({ lines: parseDiffLines(await gitStdout(root, ['diff', 'HEAD', '--', filePath], 4 * MB)) }),
    { fallback: { lines: [] } },
  );
}

export function gitLog(root: string, filePath: string, offset: number = 0) {
  return respond(async () => ({
    commits: parseLogOutput(
      await gitStdout(root, ['log', '--pretty=format:%H|%an|%ae|%ad|%s', '--date=short', '-n', '50', `--skip=${offset}`, '--', filePath], 2 * MB),
    ),
  }));
}

export function gitShow(root: string, hash: string, filePath: string) {
  return respond(async () => ({ patch: await gitStdout(root, ['show', hash, '--', filePath], 4 * MB) }));
}

export function gitBranches(root: string) {
  return respond(async () => ({
    branches: nonEmptyLines(await gitStdout(root, ['branch', '-a', '--format=%(refname:short)'])).map((b) => b.trim()),
  }));
}

export function gitCheckout(root: string, branch: string) {
  return respond(
    async () => { await gitExec(['checkout', branch], { cwd: root }); return {}; },
    { gitError: true },
  );
}

export function gitStage(root: string, filePath: string) {
  return respond(
    async () => { await gitExec(['add', filePath], { cwd: root }); return {}; },
    { gitError: true },
  );
}

export function gitUnstage(root: string, filePath: string) {
  return respond(
    async () => { await gitExec(['restore', '--staged', filePath], { cwd: root }); return {}; },
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
        console.error('[git] Failed to dispatch onGitCommit activation event:', error);
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
  return respond(async () => { await gitExec(['add', '-A'], { cwd: root }); return {}; }, { gitError: true });
}

export function gitUnstageAll(root: string) {
  return respond(async () => { await gitExec(['reset', 'HEAD'], { cwd: root }); return {}; }, { gitError: true });
}

export function gitSnapshot(root: string) {
  return respond(async () => ({ commitHash: await gitTrimmed(root, ['rev-parse', 'HEAD']) }));
}

export function gitDiffReview(root: string, commitHash: string, filePaths?: string[]) {
  const ref = commitHash && commitHash !== 'INDEX' ? commitHash : '';
  const args = ['diff'];
  if (ref) args.push(ref);
  args.push('--unified=3', '--no-color');
  if (filePaths?.length) args.push('--', ...filePaths);
  return respond(async () => ({ files: parseDiffOutput(await gitStdout(root, args, 10 * MB), root) }));
}

export function gitDiffCached(root: string, commitHash: string, filePaths?: string[]) {
  const ref = commitHash && commitHash !== 'INDEX' ? commitHash : '';
  const args = ['diff', '--cached'];
  if (ref) args.push(ref);
  args.push('--unified=3', '--no-color');
  if (filePaths?.length) args.push('--', ...filePaths);
  return respond(async () => ({ files: parseDiffOutput(await gitStdout(root, args, 10 * MB), root) }));
}

export function gitFileAtCommit(root: string, commitHash: string, filePath: string) {
  return respond(
    async () => ({
      content: await gitStdout(root, ['show', `${commitHash}:${normalizeGitPath(path.relative(root, filePath))}`], 4 * MB),
    }),
    { fallback: { content: '' } },
  );
}

export function gitRevertFile(root: string, commitHash: string, filePath: string) {
  return respond(
    async () => { await gitExec(['checkout', commitHash, '--', filePath], { cwd: root }); return {}; },
    { gitError: true },
  );
}

export function gitDiffBetween(root: string, fromHash: string, toHash: string) {
  return respond(async () => ({
    files: parseDiffOutput(await gitStdout(root, ['diff', fromHash, toHash, '--unified=3', '--no-color'], 10 * MB), root),
  }));
}

export function gitChangedFilesBetween(root: string, fromHash: string, toHash: string) {
  return respond(async () => ({ files: await getChangedFilesBetween({ root, fromHash, toHash, gitStdout, MB }) }));
}

export function gitRestoreSnapshot(root: string, commitHash: string) {
  return respond(
    async () => restoreSnapshot({ gitExec, gitStdout, gitTrimmed, root, commitHash }),
    { gitError: true },
  );
}

export function gitCreateSnapshot(root: string, label?: string) {
  return respond(
    async () => {
      await gitExec(['add', '-A'], { cwd: root });
      await gitExec(['commit', '--allow-empty', '-m', `[Ouroboros Snapshot] ${label?.trim() || 'Manual snapshot'}`], { cwd: root });
      return { commitHash: await gitTrimmed(root, ['rev-parse', 'HEAD']) };
    },
    { gitError: true },
  );
}

export async function gitDirtyCount(root: string) {
  try {
    return { success: true, count: await getDirtyCount(root) };
  } catch (err: unknown) {
    return { success: false, count: 0, error: errorMessage(err) };
  }
}

export function gitBlame(root: string, filePath: string) {
  return respond(
    async () => ({ lines: parseBlameOutput(await gitStdout(root, ['blame', '--porcelain', filePath], 4 * MB)) }),
    { fallback: { lines: [] } },
  );
}

export function gitDiffRaw(root: string, filePath: string) {
  return respond(
    async () => ({ patch: await gitStdout(root, ['diff', 'HEAD', '--unified=3', '--no-color', '--', filePath], 4 * MB) }),
    { fallback: { patch: '' } },
  );
}
