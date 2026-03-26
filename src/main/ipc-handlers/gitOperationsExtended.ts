/**
 * gitOperationsExtended.ts — Additional git operation wrappers.
 *
 * Extracted from gitOperations.ts to keep each file under 300 lines.
 * Core utilities live in gitOperations.ts; parse utilities in gitParsers.ts.
 */

import path from 'path';

import { parseBlameOutput, restoreSnapshot } from './gitBlameSnapshot';
import { parseDiffOutput } from './gitDiffParser';
import {
  errorMessage,
  getDirtyCount,
  gitExec,
  gitStdout,
  gitTrimmed,
  MB,
  respond,
} from './gitOperations';
import { normalizeGitPath } from './gitParsers';

export function gitSnapshot(root: string) {
  return respond(async () => ({ commitHash: await gitTrimmed(root, ['rev-parse', 'HEAD']) }));
}

export function gitDiffReview(root: string, commitHash: string, filePaths?: string[]) {
  const ref = commitHash && commitHash !== 'INDEX' ? commitHash : '';
  const args = ['diff'];
  if (ref) args.push(ref);
  args.push('--unified=3', '--no-color');
  if (filePaths?.length) args.push('--', ...filePaths);
  return respond(async () => ({
    files: parseDiffOutput(await gitStdout(root, args, 10 * MB), root),
  }));
}

export function gitDiffCached(root: string, commitHash: string, filePaths?: string[]) {
  const ref = commitHash && commitHash !== 'INDEX' ? commitHash : '';
  const args = ['diff', '--cached'];
  if (ref) args.push(ref);
  args.push('--unified=3', '--no-color');
  if (filePaths?.length) args.push('--', ...filePaths);
  return respond(async () => ({
    files: parseDiffOutput(await gitStdout(root, args, 10 * MB), root),
  }));
}

export function gitFileAtCommit(root: string, commitHash: string, filePath: string) {
  return respond(
    async () => ({
      content: await gitStdout(
        root,
        ['show', `${commitHash}:${normalizeGitPath(path.relative(root, filePath))}`],
        4 * MB,
      ),
    }),
    { fallback: { content: '' } },
  );
}

export function gitRevertFile(root: string, commitHash: string, filePath: string) {
  return respond(
    async () => {
      await gitExec(['checkout', commitHash, '--', filePath], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}

export function gitDiffBetween(root: string, fromHash: string, toHash: string) {
  return respond(async () => ({
    files: parseDiffOutput(
      await gitStdout(root, ['diff', fromHash, toHash, '--unified=3', '--no-color'], 10 * MB),
      root,
    ),
  }));
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
      await gitExec(
        [
          'commit',
          '--allow-empty',
          '-m',
          `[Ouroboros Snapshot] ${label?.trim() || 'Manual snapshot'}`,
        ],
        { cwd: root },
      );
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
    async () => ({
      lines: parseBlameOutput(await gitStdout(root, ['blame', '--porcelain', filePath], 4 * MB)),
    }),
    { fallback: { lines: [] } },
  );
}

export function gitDiffRaw(root: string, filePath: string) {
  return respond(
    async () => ({
      patch: await gitStdout(
        root,
        ['diff', 'HEAD', '--unified=3', '--no-color', '--', filePath],
        4 * MB,
      ),
    }),
    { fallback: { patch: '' } },
  );
}
