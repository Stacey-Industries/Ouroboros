import { ipcMain, app, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { dispatchActivationEvent } from '../extensions'
type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow
type DiffStatus = 'modified' | 'added' | 'deleted' | 'renamed'
type DiffLineKind = 'added' | 'modified' | 'deleted'
type GitResponse<T extends object> = ({ success: true } & T) | { success: false; error: string }
interface ParsedHunk { header: string; oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[]; rawPatch: string }
interface ParsedFileDiff { filePath: string; relativePath: string; status: DiffStatus; hunks: ParsedHunk[]; oldPath?: string }
interface PorcelainStatusEntry { indexStatus: string; workTreeStatus: string; filePath: string }
interface StatusSnapshot { files: Record<string, string>; staged: Record<string, string>; unstaged: Record<string, string> }
interface DiffLine { line: number; kind: DiffLineKind }
interface GitLogEntry { hash: string; author: string; email: string; date: string; message: string }
interface ChangedFile { path: string; status: string; additions: number; deletions: number }
interface BlameInfo { author: string; date: number; summary: string }
interface BlameLine extends BlameInfo { hash: string; line: number }
interface BlameMetadata extends Partial<BlameInfo> { nextIndex: number }
interface DiffMeta { relativePath: string; status: DiffStatus; oldPath?: string; diffHeader: string; startIndex: number }
const MB = 1024 * 1024
const GIT_TIMEOUT_MS = 30_000
const HUNK_HEADER_RE = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const DIFF_LINE_HEADER_RE = /^-(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@/
function gitErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  return (err as Error & { stderr?: string }).stderr?.trim() || err.message
}
function errorMessage(err: unknown, useGitMessage: boolean = false): string {
  return useGitMessage ? gitErrorMessage(err) : err instanceof Error ? err.message : String(err)
}
function gitExec(args: string[], opts: { cwd: string; maxBuffer?: number }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { ...opts, timeout: GIT_TIMEOUT_MS, maxBuffer: opts.maxBuffer ?? MB }, (err, stdout, stderr) => err ? reject(err) : resolve({ stdout, stderr }))
  })
}
async function gitStdout(root: string, args: string[], maxBuffer: number = MB): Promise<string> {
  return (await gitExec(args, { cwd: root, maxBuffer })).stdout
}
async function gitTrimmed(root: string, args: string[], maxBuffer?: number): Promise<string> {
  return (await gitStdout(root, args, maxBuffer)).trim()
}
async function respond<T extends object>(work: () => Promise<T>, options: { fallback?: T; gitError?: boolean } = {}): Promise<GitResponse<T>> {
  try { return { success: true, ...(await work()) } }
  catch (err: unknown) { return options.fallback !== undefined ? { success: true, ...options.fallback } : { success: false, error: errorMessage(err, options.gitError) } }
}
function nonEmptyLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0)
}
function normalizeGitPath(filePath: string): string {
  const renameIndex = filePath.indexOf(' -> ')
  return (renameIndex === -1 ? filePath : filePath.slice(renameIndex + 4)).replace(/\\/g, '/')
}
function parseStatusEntry(line: string): PorcelainStatusEntry {
  return { indexStatus: line[0] ?? ' ', workTreeStatus: line[1] ?? ' ', filePath: normalizeGitPath(line.slice(3)) }
}
function aggregateStatus(entry: PorcelainStatusEntry): string {
  if (entry.indexStatus === '?' && entry.workTreeStatus === '?') return '?'
  if (entry.indexStatus === 'R' || entry.workTreeStatus === 'R') return 'R'
  if (entry.indexStatus === 'A' || entry.workTreeStatus === 'A') return 'A'
  if (entry.indexStatus === 'D' || entry.workTreeStatus === 'D') return 'D'
  return 'M'
}
function addDetailedStatus(snapshot: StatusSnapshot, entry: PorcelainStatusEntry): void {
  if (entry.indexStatus !== ' ' && entry.indexStatus !== '?') snapshot.staged[entry.filePath] = entry.indexStatus
  if (entry.workTreeStatus === ' ') return
  if (entry.indexStatus === '?' && entry.workTreeStatus === '?') snapshot.unstaged[entry.filePath] = '?'
  else if (entry.workTreeStatus !== '?') snapshot.unstaged[entry.filePath] = entry.workTreeStatus
}
function parseStatusSnapshot(stdout: string): StatusSnapshot {
  const snapshot: StatusSnapshot = { files: {}, staged: {}, unstaged: {} }
  for (const entry of nonEmptyLines(stdout).map(parseStatusEntry)) {
    snapshot.files[entry.filePath] = aggregateStatus(entry)
    addDetailedStatus(snapshot, entry)
  }
  return snapshot
}
function parseDiffMeta(lines: string[]): DiffMeta | undefined {
  const header = lines[0]?.match(/^diff --git a\/(.+?) b\/(.+)$/)
  if (!header) return undefined
  let status: DiffStatus = 'modified'
  let oldPath: string | undefined
  for (const line of lines.slice(1, 6)) {
    if (line.startsWith('new file mode')) status = 'added'
    else if (line.startsWith('deleted file mode')) status = 'deleted'
    else if (line.startsWith('rename from ')) { status = 'renamed'; oldPath = line.slice(12) }
  }
  if (header[1] !== header[2] && oldPath === undefined) { status = 'renamed'; oldPath = header[1] }
  const startIndex = lines.findIndex((line, index) => index > 0 && line.startsWith('@@'))
  return { relativePath: header[2], status, oldPath, diffHeader: `${lines.slice(0, Math.max(startIndex, 0)).join('\n')}\n`, startIndex: Math.max(startIndex, 0) }
}
function parseHunk(lines: string[], startIndex: number, diffHeader: string): { hunk?: ParsedHunk; nextIndex: number } {
  const header = lines[startIndex]
  const match = header?.match(HUNK_HEADER_RE)
  if (!match || !header) return { nextIndex: startIndex + 1 }
  let nextIndex = startIndex + 1
  while (nextIndex < lines.length && !lines[nextIndex].startsWith('@@') && !lines[nextIndex].startsWith('diff --git')) nextIndex++
  const hunkLines = lines.slice(startIndex + 1, nextIndex)
  return { nextIndex, hunk: { header, oldStart: Number(match[1]), oldCount: Number(match[2] ?? '1'), newStart: Number(match[3]), newCount: Number(match[4] ?? '1'), lines: hunkLines, rawPatch: `${diffHeader}${header}\n${hunkLines.join('\n')}\n` } }
}
function parseFileDiff(fileDiff: string, root: string): ParsedFileDiff | undefined {
  const lines = fileDiff.split('\n')
  const meta = parseDiffMeta(lines)
  if (!meta) return undefined
  const hunks: ParsedHunk[] = []
  for (let index = meta.startIndex; index < lines.length;) {
    if (!lines[index].startsWith('@@')) { index++; continue }
    const parsed = parseHunk(lines, index, meta.diffHeader)
    if (parsed.hunk) hunks.push(parsed.hunk)
    index = parsed.nextIndex
  }
  return { filePath: path.resolve(root, meta.relativePath), relativePath: meta.relativePath, status: meta.status, hunks, oldPath: meta.oldPath }
}
function parseDiffOutput(diffText: string, root: string): ParsedFileDiff[] {
  if (!diffText.trim()) return []
  return diffText.split(/^(?=diff --git )/m).map((fileDiff) => parseFileDiff(fileDiff, root)).filter((file): file is ParsedFileDiff => file !== undefined)
}
function flushDeleted(lines: DiffLine[], newLine: number, newStart: number, pendingDeletes: number): number {
  if (pendingDeletes <= 0) return 0
  lines.push({ line: newLine > newStart ? newLine - 1 : newLine, kind: 'deleted' })
  return 0
}
function parseDiffSegment(segment: string): DiffLine[] {
  const match = segment.match(DIFF_LINE_HEADER_RE)
  const bodyStart = segment.indexOf('\n')
  if (!match || bodyStart === -1) return []
  const lines: DiffLine[] = []
  let newLine = Number(match[3])
  let pendingDeletes = 0
  for (const bodyLine of segment.slice(bodyStart + 1).split('\n')) {
    if (bodyLine.startsWith('-')) pendingDeletes++
    else if (bodyLine.startsWith('+')) { lines.push({ line: newLine, kind: pendingDeletes > 0 ? 'modified' : 'added' }); pendingDeletes = Math.max(0, pendingDeletes - 1); newLine++ }
    else if (!bodyLine.startsWith('\\')) { pendingDeletes = flushDeleted(lines, newLine, Number(match[3]), pendingDeletes); newLine++ }
  }
  flushDeleted(lines, newLine, Number(match[3]), pendingDeletes)
  return lines
}
function parseDiffLines(stdout: string): DiffLine[] {
  return stdout.split(/^@@\s/m).slice(1).flatMap(parseDiffSegment)
}
function parseLogOutput(stdout: string): GitLogEntry[] {
  return nonEmptyLines(stdout).flatMap((line) => {
    const match = line.match(/^([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/)
    return match ? [{ hash: match[1], author: match[2], email: match[3], date: match[4], message: match[5] }] : []
  })
}
function parseNumstat(stdout: string): ChangedFile[] {
  return nonEmptyLines(stdout).flatMap((line) => {
    const parts = line.split('\t')
    return parts.length < 3 ? [] : [{ path: parts[2], status: 'modified', additions: parts[0] === '-' ? 0 : Number(parts[0]), deletions: parts[1] === '-' ? 0 : Number(parts[1]) }]
  })
}
function parseNameStatus(stdout: string): Record<string, string> {
  const statusMap: Record<string, string> = {}
  for (const line of nonEmptyLines(stdout)) {
    const parts = line.split('\t')
    if (parts.length >= 2) statusMap[parts[parts.length - 1]] = parts[0].startsWith('A') ? 'added' : parts[0].startsWith('D') ? 'deleted' : parts[0].startsWith('R') ? 'renamed' : 'modified'
  }
  return statusMap
}
async function getChangedFilesBetween(root: string, fromHash: string, toHash: string): Promise<ChangedFile[]> {
  const files = parseNumstat(await gitStdout(root, ['diff', '--numstat', fromHash, toHash], 4 * MB))
  try {
    const statusMap = parseNameStatus(await gitStdout(root, ['diff', '--name-status', fromHash, toHash], 4 * MB))
    return files.map((file) => statusMap[file.path] ? { ...file, status: statusMap[file.path] } : file)
  } catch { return files }
}
async function getDirtyCount(root: string): Promise<number> {
  return nonEmptyLines(await gitStdout(root, ['status', '--porcelain'])).length
}
async function getPreviousBranch(root: string): Promise<string | undefined> {
  try {
    const branch = await gitTrimmed(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
    return branch === 'HEAD' ? undefined : branch
  } catch { return undefined }
}
async function stashDirtyChanges(root: string, dirtyCount: number): Promise<string | undefined> {
  if (dirtyCount === 0) return undefined
  await gitExec(['stash', 'push', '-m', `ouroboros-time-travel-${Date.now()}`, '--include-untracked'], { cwd: root })
  try { return (await gitStdout(root, ['stash', 'list', '--format=%gd %s', '-n', '1'])).match(/^(stash@\{\d+\})/)?.[1] ?? 'stash@{0}' }
  catch { return 'stash@{0}' }
}
function snapshotBranchBase(now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `ouroboros/snapshot-${stamp}`
}
async function checkoutSnapshotBranch(root: string, commitHash: string, branchName: string): Promise<string> {
  try { await gitExec(['checkout', '-b', branchName, commitHash], { cwd: root }); return branchName }
  catch {
    const fallback = `${branchName}-${Math.random().toString(36).slice(2, 6)}`
    await gitExec(['checkout', '-b', fallback, commitHash], { cwd: root })
    return fallback
  }
}
async function restoreSnapshot(root: string, commitHash: string): Promise<{ stashRef?: string; dirtyCount: number; branch: string; previousBranch?: string }> {
  const dirtyCount = await respond(async () => ({ count: await getDirtyCount(root) }), { fallback: { count: 0 } }).then((result) => result.success ? result.count : 0)
  const previousBranch = await getPreviousBranch(root)
  const stashRef = await stashDirtyChanges(root, dirtyCount)
  const branch = await checkoutSnapshotBranch(root, commitHash, snapshotBranchBase())
  return { stashRef, dirtyCount, branch, previousBranch }
}
function parseBlameHeader(line: string): { hash: string; line: number } | undefined {
  const match = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/)
  return match ? { hash: match[1], line: Number(match[2]) } : undefined
}
function readBlameMetadata(lines: string[], startIndex: number): BlameMetadata {
  const metadata: BlameMetadata = { nextIndex: startIndex }
  while (metadata.nextIndex < lines.length && !lines[metadata.nextIndex].startsWith('\t')) {
    const line = lines[metadata.nextIndex]
    if (line.startsWith('author ')) metadata.author = line.slice(7)
    else if (line.startsWith('author-time ')) metadata.date = Number(line.slice(12))
    else if (line.startsWith('summary ')) metadata.summary = line.slice(8)
    metadata.nextIndex++
  }
  if (lines[metadata.nextIndex]?.startsWith('\t')) metadata.nextIndex++
  return metadata
}
function resolveBlameInfo(cache: Map<string, BlameInfo>, hash: string, metadata: BlameMetadata): BlameInfo {
  const base = cache.get(hash) ?? { author: 'Unknown', date: 0, summary: '' }
  const info = { author: metadata.author ?? base.author, date: metadata.date ?? base.date, summary: metadata.summary ?? base.summary }
  if (metadata.author !== undefined) cache.set(hash, info)
  return info
}
function parseBlameOutput(stdout: string): BlameLine[] {
  const result: BlameLine[] = []
  const cache = new Map<string, BlameInfo>()
  const lines = stdout.split('\n')
  for (let index = 0; index < lines.length;) {
    const header = parseBlameHeader(lines[index])
    if (!header) { index++; continue }
    const metadata = readBlameMetadata(lines, index + 1)
    result.push({ hash: header.hash, line: header.line, ...resolveBlameInfo(cache, header.hash, metadata) })
    index = metadata.nextIndex
  }
  return result
}
async function isTracked(root: string, filePath: string): Promise<boolean> {
  try { await gitExec(['ls-files', '--error-unmatch', filePath], { cwd: root }); return true }
  catch { return false }
}
async function discardFile(root: string, filePath: string): Promise<GitResponse<Record<string, never>>> {
  return isTracked(root, filePath) ? respond(async () => { await gitExec(['checkout', 'HEAD', '--', filePath], { cwd: root }); return {} }, { gitError: true }) : respond(async () => { await fs.unlink(path.resolve(root, filePath)); return {} })
}
async function applyPatch(root: string, patchContent: string, reverse: boolean = false): Promise<GitResponse<Record<string, never>>> {
  const tmpFile = path.join(app.getPath('temp'), `ouroboros-hunk-${Date.now()}.patch`)
  try { await fs.writeFile(tmpFile, patchContent, 'utf-8'); await gitExec(reverse ? ['apply', '-R', '--whitespace=nowarn', tmpFile] : ['apply', '--whitespace=nowarn', tmpFile], { cwd: root }); return { success: true } }
  catch (err: unknown) { return { success: false, error: gitErrorMessage(err) } }
  finally { void fs.unlink(tmpFile).catch(() => {}) }
}
function gitIsRepo(root: string) { return respond(async () => { await gitExec(['rev-parse', '--git-dir'], { cwd: root }); return { isRepo: true } }, { fallback: { isRepo: false } }) }
function gitStatus(root: string) { return respond(async () => ({ files: parseStatusSnapshot(await gitStdout(root, ['status', '--porcelain=v1'])).files })) }
function gitBranch(root: string) { return respond(async () => ({ branch: await gitTrimmed(root, ['rev-parse', '--abbrev-ref', 'HEAD']) })) }
function gitDiff(root: string, filePath: string) { return respond(async () => ({ lines: parseDiffLines(await gitStdout(root, ['diff', 'HEAD', '--', filePath], 4 * MB)) }), { fallback: { lines: [] } }) }
function gitLog(root: string, filePath: string, offset: number = 0) { return respond(async () => ({ commits: parseLogOutput(await gitStdout(root, ['log', '--pretty=format:%H|%an|%ae|%ad|%s', '--date=short', '-n', '50', `--skip=${offset}`, '--', filePath], 2 * MB)) })) }
function gitShow(root: string, hash: string, filePath: string) { return respond(async () => ({ patch: await gitStdout(root, ['show', hash, '--', filePath], 4 * MB) })) }
function gitBranches(root: string) { return respond(async () => ({ branches: nonEmptyLines(await gitStdout(root, ['branch', '-a', '--format=%(refname:short)'])).map((branch) => branch.trim()) })) }
function gitCheckout(root: string, branch: string) { return respond(async () => { await gitExec(['checkout', branch], { cwd: root }); return {} }, { gitError: true }) }
function gitStage(root: string, filePath: string) { return respond(async () => { await gitExec(['add', filePath], { cwd: root }); return {} }, { gitError: true }) }
function gitUnstage(root: string, filePath: string) { return respond(async () => { await gitExec(['restore', '--staged', filePath], { cwd: root }); return {} }, { gitError: true }) }
function gitStatusDetailed(root: string) { return respond(async () => { const snapshot = parseStatusSnapshot(await gitStdout(root, ['status', '--porcelain=v1'])); return { staged: snapshot.staged, unstaged: snapshot.unstaged } }) }
function gitCommit(root: string, message: string) { return respond(async () => { await gitExec(['commit', '-m', message], { cwd: root }); dispatchActivationEvent('onGitCommit', { root, message }).catch(() => {}); return {} }, { gitError: true }) }
function gitStageAll(root: string) { return respond(async () => { await gitExec(['add', '-A'], { cwd: root }); return {} }, { gitError: true }) }
function gitUnstageAll(root: string) { return respond(async () => { await gitExec(['reset', 'HEAD'], { cwd: root }); return {} }, { gitError: true }) }
function gitSnapshot(root: string) { return respond(async () => ({ commitHash: await gitTrimmed(root, ['rev-parse', 'HEAD']) })) }
function gitDiffReview(root: string, commitHash: string) { return respond(async () => ({ files: parseDiffOutput(await gitStdout(root, ['diff', commitHash, '--unified=3', '--no-color'], 10 * MB), root) })) }
function gitFileAtCommit(root: string, commitHash: string, filePath: string) { return respond(async () => ({ content: await gitStdout(root, ['show', `${commitHash}:${normalizeGitPath(path.relative(root, filePath))}`], 4 * MB) }), { fallback: { content: '' } }) }
function gitRevertFile(root: string, commitHash: string, filePath: string) { return respond(async () => { await gitExec(['checkout', commitHash, '--', filePath], { cwd: root }); return {} }, { gitError: true }) }
function gitDiffBetween(root: string, fromHash: string, toHash: string) { return respond(async () => ({ files: parseDiffOutput(await gitStdout(root, ['diff', fromHash, toHash, '--unified=3', '--no-color'], 10 * MB), root) })) }
function gitChangedFilesBetween(root: string, fromHash: string, toHash: string) { return respond(async () => ({ files: await getChangedFilesBetween(root, fromHash, toHash) })) }
function gitRestoreSnapshot(root: string, commitHash: string) { return respond(async () => restoreSnapshot(root, commitHash), { gitError: true }) }
function gitCreateSnapshot(root: string, label?: string) { return respond(async () => { await gitExec(['add', '-A'], { cwd: root }); await gitExec(['commit', '--allow-empty', '-m', `[Ouroboros Snapshot] ${label?.trim() || 'Manual snapshot'}`], { cwd: root }); return { commitHash: await gitTrimmed(root, ['rev-parse', 'HEAD']) } }, { gitError: true }) }
async function gitDirtyCount(root: string) { try { return { success: true, count: await getDirtyCount(root) } } catch (err: unknown) { return { success: false, count: 0, error: errorMessage(err) } } }
function gitBlame(root: string, filePath: string) { return respond(async () => ({ lines: parseBlameOutput(await gitStdout(root, ['blame', '--porcelain', filePath], 4 * MB)) }), { fallback: { lines: [] } }) }
export function registerGitHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow
  const register = <T extends unknown[]>(channel: string, handler: (...args: T) => Promise<unknown>): string => { ipcMain.handle(channel, (_event, ...args) => handler(...(args as T))); return channel }
  return [
    register('git:isRepo', gitIsRepo), register('git:status', gitStatus), register('git:branch', gitBranch), register('git:diff', gitDiff),
    register('git:log', gitLog), register('git:show', gitShow), register('git:branches', gitBranches), register('git:checkout', gitCheckout),
    register('git:stage', gitStage), register('git:unstage', gitUnstage), register('git:statusDetailed', gitStatusDetailed), register('git:commit', gitCommit),
    register('git:stageAll', gitStageAll), register('git:unstageAll', gitUnstageAll), register('git:discardFile', discardFile), register('git:snapshot', gitSnapshot),
    register('git:diffReview', gitDiffReview), register('git:fileAtCommit', gitFileAtCommit), register('git:applyHunk', (root: string, patchContent: string) => applyPatch(root, patchContent)), register('git:revertHunk', (root: string, patchContent: string) => applyPatch(root, patchContent, true)),
    register('git:revertFile', gitRevertFile), register('git:diffBetween', gitDiffBetween), register('git:changedFilesBetween', gitChangedFilesBetween), register('git:restoreSnapshot', gitRestoreSnapshot),
    register('git:createSnapshot', gitCreateSnapshot), register('git:dirtyCount', gitDirtyCount), register('git:blame', gitBlame),
  ]
}
