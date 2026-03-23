/**
 * gitParsers.ts — Git output parsing utilities.
 *
 * Extracted from gitOperations.ts to keep each file under 300 lines.
 */

import path from 'path';

export type DiffStatus = 'modified' | 'added' | 'deleted' | 'renamed';
export type DiffLineKind = 'added' | 'modified' | 'deleted';
export type GitResponse<T extends object> = ({ success: true } & T) | { success: false; error: string };

export interface ParsedHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
  rawPatch: string;
}

export interface ParsedFileDiff {
  filePath: string;
  relativePath: string;
  status: DiffStatus;
  hunks: ParsedHunk[];
  oldPath?: string;
}

export interface PorcelainStatusEntry {
  indexStatus: string;
  workTreeStatus: string;
  filePath: string;
}

export interface StatusSnapshot {
  files: Map<string, string>;
  staged: Map<string, string>;
  unstaged: Map<string, string>;
}

export interface DiffLine {
  line: number;
  kind: DiffLineKind;
}

export interface GitLogEntry {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface DiffMeta {
  relativePath: string;
  status: DiffStatus;
  oldPath?: string;
  diffHeader: string;
  startIndex: number;
}

export function nonEmptyLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0);
}

export function toRecord(map: Map<string, string>): Record<string, string> {
  return Object.fromEntries(map);
}

export function normalizeGitPath(filePath: string): string {
  const renameIndex = filePath.indexOf(' -> ');
  return (renameIndex === -1 ? filePath : filePath.slice(renameIndex + 4)).replace(/\\/g, '/');
}

export function parseStatusEntry(line: string): PorcelainStatusEntry {
  return {
    indexStatus: line[0] ?? ' ',
    workTreeStatus: line[1] ?? ' ',
    filePath: normalizeGitPath(line.slice(3)),
  };
}

function aggregateStatus(entry: PorcelainStatusEntry): string {
  if (entry.indexStatus === '?' && entry.workTreeStatus === '?') return '?';
  if (entry.indexStatus === 'R' || entry.workTreeStatus === 'R') return 'R';
  if (entry.indexStatus === 'A' || entry.workTreeStatus === 'A') return 'A';
  if (entry.indexStatus === 'D' || entry.workTreeStatus === 'D') return 'D';
  return 'M';
}

function addDetailedStatus(snapshot: StatusSnapshot, entry: PorcelainStatusEntry): void {
  if (entry.indexStatus !== ' ' && entry.indexStatus !== '?')
    snapshot.staged.set(entry.filePath, entry.indexStatus);
  if (entry.workTreeStatus === ' ') return;
  if (entry.indexStatus === '?' && entry.workTreeStatus === '?')
    snapshot.unstaged.set(entry.filePath, '?');
  else if (entry.workTreeStatus !== '?')
    snapshot.unstaged.set(entry.filePath, entry.workTreeStatus);
}

export function parseStatusSnapshot(stdout: string): StatusSnapshot {
  const snapshot: StatusSnapshot = { files: new Map(), staged: new Map(), unstaged: new Map() };
  for (const entry of nonEmptyLines(stdout).map(parseStatusEntry)) {
    snapshot.files.set(entry.filePath, aggregateStatus(entry));
    addDetailedStatus(snapshot, entry);
  }
  return snapshot;
}

function parseRangeToken(token: string): { start: number; count: number } | undefined {
  const [startText, countText] = token.split(',');
  const start = Number(startText);
  if (!Number.isFinite(start)) return undefined;
  const count = countText === undefined ? 1 : Number(countText);
  return Number.isFinite(count) ? { start, count } : undefined;
}

export function parseHunkHeader(
  header: string,
): { oldStart: number; oldCount: number; newStart: number; newCount: number } | undefined {
  const end = header.lastIndexOf(' @@');
  if (!header.startsWith('@@ -') || end === -1) return undefined;
  const [oldToken, newToken] = header.slice(4, end).trim().split(' +');
  const oldRange = oldToken?.startsWith('-') ? parseRangeToken(oldToken.slice(1)) : undefined;
  const newRange = newToken?.startsWith('+') ? parseRangeToken(newToken.slice(1)) : undefined;
  return oldRange && newRange
    ? { oldStart: oldRange.start, oldCount: oldRange.count, newStart: newRange.start, newCount: newRange.count }
    : undefined;
}

function parseDiffLineHeader(header: string): { newStart: number } | undefined {
  const end = header.indexOf(' @@');
  if (!header.startsWith('-') || end === -1) return undefined;
  const [, newToken] = header.slice(1, end).trim().split(' +');
  const newRange = newToken?.startsWith('+') ? parseRangeToken(newToken.slice(1)) : undefined;
  return newRange ? { newStart: newRange.start } : undefined;
}

function parseDiffMeta(lines: string[]): DiffMeta | undefined {
  const header = lines[0]?.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!header) return undefined;
  let status: DiffStatus = 'modified';
  let oldPath: string | undefined;
  for (const line of lines.slice(1, 6)) {
    if (line.startsWith('new file mode')) status = 'added';
    else if (line.startsWith('deleted file mode')) status = 'deleted';
    else if (line.startsWith('rename from ')) { status = 'renamed'; oldPath = line.slice(12); }
  }
  if (header[1] !== header[2] && oldPath === undefined) { status = 'renamed'; oldPath = header[1]; }
  const startIndex = lines.findIndex((line, index) => index > 0 && line.startsWith('@@'));
  return {
    relativePath: header[2],
    status,
    oldPath,
    diffHeader: `${lines.slice(0, Math.max(startIndex, 0)).join('\n')}\n`,
    startIndex: Math.max(startIndex, 0),
  };
}

export function parseHunk(
  lines: string[],
  startIndex: number,
  diffHeader: string,
): { hunk?: ParsedHunk; nextIndex: number } {
  const header = lines.at(startIndex);
  const match = header ? parseHunkHeader(header) : undefined;
  if (!match || !header) return { nextIndex: startIndex + 1 };
  let nextIndex = startIndex + 1;
  while (true) {
    const nextLine = lines.at(nextIndex);
    if (!nextLine || nextLine.startsWith('@@') || nextLine.startsWith('diff --git')) break;
    nextIndex++;
  }
  const hunkLines = lines.slice(startIndex + 1, nextIndex);
  return {
    nextIndex,
    hunk: {
      header,
      oldStart: match.oldStart,
      oldCount: match.oldCount,
      newStart: match.newStart,
      newCount: match.newCount,
      lines: hunkLines,
      rawPatch: `${diffHeader}${header}\n${hunkLines.join('\n')}\n`,
    },
  };
}

function parseFileDiff(fileDiff: string, root: string): ParsedFileDiff | undefined {
  const lines = fileDiff.split('\n');
  const meta = parseDiffMeta(lines);
  if (!meta) return undefined;
  const hunks: ParsedHunk[] = [];
  for (let index = meta.startIndex; index < lines.length; ) {
    const line = lines.at(index);
    if (!line?.startsWith('@@')) { index++; continue; }
    const parsed = parseHunk(lines, index, meta.diffHeader);
    if (parsed.hunk) hunks.push(parsed.hunk);
    index = parsed.nextIndex;
  }
  return { filePath: path.resolve(root, meta.relativePath), relativePath: meta.relativePath, status: meta.status, hunks, oldPath: meta.oldPath };
}

export function parseDiffOutput(diffText: string, root: string): ParsedFileDiff[] {
  if (!diffText.trim()) return [];
  return diffText
    .split(/^(?=diff --git )/m)
    .map((fileDiff) => parseFileDiff(fileDiff, root))
    .filter((file): file is ParsedFileDiff => file !== undefined);
}

function flushDeleted(lines: DiffLine[], newLine: number, newStart: number, pendingDeletes: number): number {
  if (pendingDeletes <= 0) return 0;
  lines.push({ line: newLine > newStart ? newLine - 1 : newLine, kind: 'deleted' });
  return 0;
}

function parseDiffSegment(segment: string): DiffLine[] {
  const match = parseDiffLineHeader(segment.split('\n', 1)[0] ?? '');
  const bodyStart = segment.indexOf('\n');
  if (!match || bodyStart === -1) return [];
  const lines: DiffLine[] = [];
  let newLine = match.newStart;
  let pendingDeletes = 0;
  for (const bodyLine of segment.slice(bodyStart + 1).split('\n')) {
    if (bodyLine.startsWith('-')) pendingDeletes++;
    else if (bodyLine.startsWith('+')) {
      lines.push({ line: newLine, kind: pendingDeletes > 0 ? 'modified' : 'added' });
      pendingDeletes = Math.max(0, pendingDeletes - 1);
      newLine++;
    } else if (!bodyLine.startsWith('\\')) {
      pendingDeletes = flushDeleted(lines, newLine, match.newStart, pendingDeletes);
      newLine++;
    }
  }
  flushDeleted(lines, newLine, match.newStart, pendingDeletes);
  return lines;
}

export function parseDiffLines(stdout: string): DiffLine[] {
  return stdout.split(/^@@\s/m).slice(1).flatMap(parseDiffSegment);
}

export function parseLogOutput(stdout: string): GitLogEntry[] {
  return nonEmptyLines(stdout).flatMap((line) => {
    const match = line.match(/^([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/);
    return match
      ? [{ hash: match[1], author: match[2], email: match[3], date: match[4], message: match[5] }]
      : [];
  });
}

function parseNumstat(stdout: string): ChangedFile[] {
  return nonEmptyLines(stdout).flatMap((line) => {
    const parts = line.split('\t');
    return parts.length < 3
      ? []
      : [{ path: parts[2], status: 'modified', additions: parts[0] === '-' ? 0 : Number(parts[0]), deletions: parts[1] === '-' ? 0 : Number(parts[1]) }];
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

interface ChangedFilesOptions {
  root: string;
  fromHash: string;
  toHash: string;
  gitStdout: (root: string, args: string[], maxBuffer?: number) => Promise<string>;
  MB: number;
}

export async function getChangedFilesBetween(opts: ChangedFilesOptions): Promise<ChangedFile[]> {
  const { root, fromHash, toHash, gitStdout, MB } = opts;
  const files = parseNumstat(await gitStdout(root, ['diff', '--numstat', fromHash, toHash], 4 * MB));
  try {
    const statusMap = parseNameStatus(await gitStdout(root, ['diff', '--name-status', fromHash, toHash], 4 * MB));
    return files.map((file) => {
      const mappedStatus = statusMap[file.path];
      return mappedStatus ? { ...file, status: mappedStatus } : file;
    });
  } catch {
    return files;
  }
}
