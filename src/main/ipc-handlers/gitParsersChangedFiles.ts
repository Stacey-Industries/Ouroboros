/**
 * gitParsersChangedFiles.ts — Helpers for computing changed files between two refs.
 *
 * Extracted from gitParsers.ts to keep that file under 300 lines.
 */

import { nonEmptyLines } from './gitParsers';

export interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

function parseNumstat(stdout: string): ChangedFile[] {
  return nonEmptyLines(stdout).flatMap((line) => {
    const parts = line.split('\t');
    return parts.length < 3
      ? []
      : [
          {
            path: parts[2],
            status: 'modified',
            additions: parts[0] === '-' ? 0 : Number(parts[0]),
            deletions: parts[1] === '-' ? 0 : Number(parts[1]),
          },
        ];
  });
}

function classifyNameStatus(prefix: string): string {
  if (prefix.startsWith('A')) return 'added';
  if (prefix.startsWith('D')) return 'deleted';
  if (prefix.startsWith('R')) return 'renamed';
  return 'modified';
}

function parseNameStatus(stdout: string): Record<string, string> {
  const statusMap = new Map<string, string>();
  for (const line of nonEmptyLines(stdout)) {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const filePath = parts[parts.length - 1];
      statusMap.set(filePath, classifyNameStatus(parts[0]));
    }
  }
  return Object.fromEntries(statusMap);
}

export interface ChangedFilesOptions {
  root: string;
  fromHash: string;
  toHash: string;
  gitStdout: (root: string, args: string[], maxBuffer?: number) => Promise<string>;
  MB: number;
}

export async function getChangedFilesBetween(opts: ChangedFilesOptions): Promise<ChangedFile[]> {
  const { root, fromHash, toHash, gitStdout, MB } = opts;
  const files = parseNumstat(
    await gitStdout(root, ['diff', '--numstat', fromHash, toHash], 4 * MB),
  );
  try {
    const statusMap = parseNameStatus(
      await gitStdout(root, ['diff', '--name-status', fromHash, toHash], 4 * MB),
    );
    return files.map((file) => {
      const mappedStatus = statusMap[file.path];
      return mappedStatus ? { ...file, status: mappedStatus } : file;
    });
  } catch {
    return files;
  }
}
