import { execFile } from 'child_process';
import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { getGraphController } from '../codebaseGraph/graphController';
import { getContextLayerController } from '../contextLayer/contextLayerController';
import { dispatchActivationEvent } from '../extensions';
import { invalidateSnapshotCache as invalidateAgentChatCache } from './agentChat';
import { parseBlameOutput, restoreSnapshot } from './gitBlameSnapshot';
import { applyPatch, stagePatch } from './gitPatch';
import { assertPathAllowed } from './pathSecurity';
type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type DiffStatus = 'modified' | 'added' | 'deleted' | 'renamed';
type DiffLineKind = 'added' | 'modified' | 'deleted';
type GitResponse<T extends object> = ({ success: true } & T) | { success: false; error: string };
interface ParsedHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
  rawPatch: string;
}
interface ParsedFileDiff {
  filePath: string;
  relativePath: string;
  status: DiffStatus;
  hunks: ParsedHunk[];
  oldPath?: string;
}
interface PorcelainStatusEntry {
  indexStatus: string;
  workTreeStatus: string;
  filePath: string;
}
interface StatusSnapshot {
  files: Map<string, string>;
  staged: Map<string, string>;
  unstaged: Map<string, string>;
}
interface DiffLine {
  line: number;
  kind: DiffLineKind;
}
interface GitLogEntry {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}
interface ChangedFile {
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
const MB = 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;
function gitErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return (err as Error & { stderr?: string }).stderr?.trim() || err.message;
}
function errorMessage(err: unknown, useGitMessage: boolean = false): string {
  return useGitMessage ? gitErrorMessage(err) : err instanceof Error ? err.message : String(err);
}
function gitExec(
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
async function gitStdout(root: string, args: string[], maxBuffer: number = MB): Promise<string> {
  return (await gitExec(args, { cwd: root, maxBuffer })).stdout;
}
async function gitTrimmed(root: string, args: string[], maxBuffer?: number): Promise<string> {
  return (await gitStdout(root, args, maxBuffer)).trim();
}
async function respond<T extends object>(
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
function nonEmptyLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0);
}
function toRecord(map: Map<string, string>): Record<string, string> {
  return Object.fromEntries(map);
}
function normalizeGitPath(filePath: string): string {
  const renameIndex = filePath.indexOf(' -> ');
  return (renameIndex === -1 ? filePath : filePath.slice(renameIndex + 4)).replace(/\\/g, '/');
}
function parseStatusEntry(line: string): PorcelainStatusEntry {
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
function parseStatusSnapshot(stdout: string): StatusSnapshot {
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
function parseHunkHeader(
  header: string,
): { oldStart: number; oldCount: number; newStart: number; newCount: number } | undefined {
  const end = header.lastIndexOf(' @@');
  if (!header.startsWith('@@ -') || end === -1) return undefined;
  const [oldToken, newToken] = header.slice(4, end).trim().split(' +');
  const oldRange = oldToken?.startsWith('-') ? parseRangeToken(oldToken.slice(1)) : undefined;
  const newRange = newToken?.startsWith('+') ? parseRangeToken(newToken.slice(1)) : undefined;
  return oldRange && newRange
    ? {
        oldStart: oldRange.start,
        oldCount: oldRange.count,
        newStart: newRange.start,
        newCount: newRange.count,
      }
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
    else if (line.startsWith('rename from ')) {
      status = 'renamed';
      oldPath = line.slice(12);
    }
  }
  if (header[1] !== header[2] && oldPath === undefined) {
    status = 'renamed';
    oldPath = header[1];
  }
  const startIndex = lines.findIndex((line, index) => index > 0 && line.startsWith('@@'));
  return {
    relativePath: header[2],
    status,
    oldPath,
    diffHeader: `${lines.slice(0, Math.max(startIndex, 0)).join('\n')}\n`,
    startIndex: Math.max(startIndex, 0),
  };
}
function parseHunk(
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
    if (!line?.startsWith('@@')) {
      index++;
      continue;
    }
    const parsed = parseHunk(lines, index, meta.diffHeader);
    if (parsed.hunk) hunks.push(parsed.hunk);
    index = parsed.nextIndex;
  }
  return {
    filePath: path.resolve(root, meta.relativePath),
    relativePath: meta.relativePath,
    status: meta.status,
    hunks,
    oldPath: meta.oldPath,
  };
}
function parseDiffOutput(diffText: string, root: string): ParsedFileDiff[] {
  if (!diffText.trim()) return [];
  return diffText
    .split(/^(?=diff --git )/m)
    .map((fileDiff) => parseFileDiff(fileDiff, root))
    .filter((file): file is ParsedFileDiff => file !== undefined);
}
function flushDeleted(
  lines: DiffLine[],
  newLine: number,
  newStart: number,
  pendingDeletes: number,
): number {
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
function parseDiffLines(stdout: string): DiffLine[] {
  return stdout.split(/^@@\s/m).slice(1).flatMap(parseDiffSegment);
}
function parseLogOutput(stdout: string): GitLogEntry[] {
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
async function getChangedFilesBetween(
  root: string,
  fromHash: string,
  toHash: string,
): Promise<ChangedFile[]> {
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
async function getDirtyCount(root: string): Promise<number> {
  return nonEmptyLines(await gitStdout(root, ['status', '--porcelain'])).length;
}
async function isTracked(root: string, filePath: string): Promise<boolean> {
  try {
    await gitExec(['ls-files', '--error-unmatch', filePath], { cwd: root });
    return true;
  } catch {
    return false;
  }
}
async function discardFile(
  root: string,
  filePath: string,
): Promise<GitResponse<Record<string, never>>> {
  if (await isTracked(root, filePath)) {
    return respond(
      async () => {
        await gitExec(['checkout', 'HEAD', '--', filePath], { cwd: root });
        return {};
      },
      { gitError: true },
    );
  }
  return respond(async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is validated by assertPathAllowed in registerSecure before reaching discardFile
    await fs.unlink(path.resolve(root, filePath));
    return {};
  });
}
function gitIsRepo(root: string) {
  return respond(
    async () => {
      await gitExec(['rev-parse', '--git-dir'], { cwd: root });
      return { isRepo: true };
    },
    { fallback: { isRepo: false } },
  );
}
function gitStatus(root: string) {
  return respond(async () => ({
    files: toRecord(parseStatusSnapshot(await gitStdout(root, ['status', '--porcelain=v1'])).files),
  }));
}
function gitBranch(root: string) {
  return respond(async () => ({
    branch: await gitTrimmed(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
  }));
}
function gitDiff(root: string, filePath: string) {
  return respond(
    async () => ({
      lines: parseDiffLines(await gitStdout(root, ['diff', 'HEAD', '--', filePath], 4 * MB)),
    }),
    { fallback: { lines: [] } },
  );
}
function gitLog(root: string, filePath: string, offset: number = 0) {
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
function gitShow(root: string, hash: string, filePath: string) {
  return respond(async () => ({
    patch: await gitStdout(root, ['show', hash, '--', filePath], 4 * MB),
  }));
}
function gitBranches(root: string) {
  return respond(async () => ({
    branches: nonEmptyLines(
      await gitStdout(root, ['branch', '-a', '--format=%(refname:short)']),
    ).map((branch) => branch.trim()),
  }));
}
function gitCheckout(root: string, branch: string) {
  return respond(
    async () => {
      await gitExec(['checkout', branch], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}
function gitStage(root: string, filePath: string) {
  return respond(
    async () => {
      await gitExec(['add', filePath], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}
function gitUnstage(root: string, filePath: string) {
  return respond(
    async () => {
      await gitExec(['restore', '--staged', filePath], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}
function gitStatusDetailed(root: string) {
  return respond(async () => {
    const snapshot = parseStatusSnapshot(await gitStdout(root, ['status', '--porcelain=v1']));
    return { staged: toRecord(snapshot.staged), unstaged: toRecord(snapshot.unstaged) };
  });
}
function gitCommit(root: string, message: string) {
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
function gitStageAll(root: string) {
  return respond(
    async () => {
      await gitExec(['add', '-A'], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}
function gitUnstageAll(root: string) {
  return respond(
    async () => {
      await gitExec(['reset', 'HEAD'], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}
function gitSnapshot(root: string) {
  return respond(async () => ({ commitHash: await gitTrimmed(root, ['rev-parse', 'HEAD']) }));
}
function gitDiffReview(root: string, commitHash: string, filePaths?: string[]) {
  const ref = commitHash && commitHash !== 'INDEX' ? commitHash : '';
  const args = ['diff'];
  if (ref) args.push(ref);
  args.push('--unified=3', '--no-color');
  if (filePaths?.length) {
    args.push('--', ...filePaths);
  }
  return respond(async () => ({
    files: parseDiffOutput(await gitStdout(root, args, 10 * MB), root),
  }));
}
function gitDiffCached(root: string, commitHash: string, filePaths?: string[]) {
  const ref = commitHash && commitHash !== 'INDEX' ? commitHash : '';
  const args = ['diff', '--cached'];
  if (ref) args.push(ref);
  args.push('--unified=3', '--no-color');
  if (filePaths?.length) {
    args.push('--', ...filePaths);
  }
  return respond(async () => ({
    files: parseDiffOutput(await gitStdout(root, args, 10 * MB), root),
  }));
}
function gitFileAtCommit(root: string, commitHash: string, filePath: string) {
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
function gitRevertFile(root: string, commitHash: string, filePath: string) {
  return respond(
    async () => {
      await gitExec(['checkout', commitHash, '--', filePath], { cwd: root });
      return {};
    },
    { gitError: true },
  );
}
function gitDiffBetween(root: string, fromHash: string, toHash: string) {
  return respond(async () => ({
    files: parseDiffOutput(
      await gitStdout(root, ['diff', fromHash, toHash, '--unified=3', '--no-color'], 10 * MB),
      root,
    ),
  }));
}
function gitChangedFilesBetween(root: string, fromHash: string, toHash: string) {
  return respond(async () => ({ files: await getChangedFilesBetween(root, fromHash, toHash) }));
}
function gitRestoreSnapshot(root: string, commitHash: string) {
  return respond(
    async () => restoreSnapshot({ gitExec, gitStdout, gitTrimmed, root, commitHash }),
    { gitError: true },
  );
}
function gitCreateSnapshot(root: string, label?: string) {
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
async function gitDirtyCount(root: string) {
  try {
    return { success: true, count: await getDirtyCount(root) };
  } catch (err: unknown) {
    return { success: false, count: 0, error: errorMessage(err) };
  }
}
function gitBlame(root: string, filePath: string) {
  return respond(
    async () => ({
      lines: parseBlameOutput(await gitStdout(root, ['blame', '--porcelain', filePath], 4 * MB)),
    }),
    { fallback: { lines: [] } },
  );
}
function gitDiffRaw(root: string, filePath: string) {
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
type SecureRegister = <T extends [string, ...unknown[]]>(
  channel: string,
  handler: (...args: T) => Promise<unknown>,
) => string;
function buildSecureRegister(): SecureRegister {
  return (channel, handler) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const root = args[0] as string;
      const denied = assertPathAllowed(event, root);
      if (denied) return denied;
      return handler(...(args as Parameters<typeof handler>));
    });
    return channel;
  };
}
function registerCoreGitChannels(rs: SecureRegister): string[] {
  return [
    rs('git:isRepo', gitIsRepo),
    rs('git:status', gitStatus),
    rs('git:branch', gitBranch),
    rs('git:diff', gitDiff),
    rs('git:log', gitLog),
    rs('git:show', gitShow),
    rs('git:branches', gitBranches),
    rs('git:checkout', gitCheckout),
    rs('git:stage', gitStage),
    rs('git:unstage', gitUnstage),
    rs('git:statusDetailed', gitStatusDetailed),
    rs('git:commit', gitCommit),
    rs('git:stageAll', gitStageAll),
    rs('git:unstageAll', gitUnstageAll),
  ];
}
function registerSnapshotGitChannels(rs: SecureRegister): string[] {
  return [
    rs('git:discardFile', discardFile),
    rs('git:snapshot', gitSnapshot),
    rs('git:diffReview', gitDiffReview),
    rs('git:diffCached', gitDiffCached),
    rs('git:fileAtCommit', gitFileAtCommit),
    rs('git:applyHunk', (root: string, patchContent: string) =>
      applyPatch(gitExec, root, patchContent),
    ),
    rs('git:revertHunk', (root: string, patchContent: string) =>
      applyPatch(gitExec, root, patchContent, true),
    ),
    rs('git:stageHunk', (root: string, patchContent: string) =>
      stagePatch(gitExec, root, patchContent),
    ),
    rs('git:revertFile', gitRevertFile),
    rs('git:diffBetween', gitDiffBetween),
    rs('git:changedFilesBetween', gitChangedFilesBetween),
    rs('git:restoreSnapshot', gitRestoreSnapshot),
    rs('git:createSnapshot', gitCreateSnapshot),
    rs('git:dirtyCount', gitDirtyCount),
    rs('git:blame', gitBlame),
    rs('git:diffRaw', gitDiffRaw),
  ];
}
export function registerGitHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const rs = buildSecureRegister();
  return [...registerCoreGitChannels(rs), ...registerSnapshotGitChannels(rs)];
}
