import { execFile } from 'child_process'
import path from 'path'

import type { RootRepoIndexSnapshot } from './repoIndexer'
import { normalizePathForCompare, takeRecentFiles } from './repoIndexerHelpers'
import type {
  DiagnosticsFileSummary,
  DiagnosticsSummary,
  GitDiffFileSummary,
  GitDiffHunk,
  GitDiffSummary,
  RecentCommit,
  RecentEditsSummary,
  RepoFacts,
} from './types'

const GIT_STATUS_TIMEOUT_MS = 10_000
const MAX_HUNKS_PER_FILE = 20
const MAX_MESSAGES_PER_FILE = 10
const MAX_MESSAGES_TOTAL = 50
const SEVERITY_PRIORITY: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 }

function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 15_000, maxBuffer: 512 * 1024 }, (error, stdout) => {
      if (error) { reject(error); return }
      resolve(stdout)
    })
  })
}

function execGitStatus(cwd: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain=v1', '-unormal'], { cwd, timeout: GIT_STATUS_TIMEOUT_MS, maxBuffer: 512 * 1024 }, (error, stdout) => {
      if (error) { resolve({ error: error.message, files: {} }); return }
      const files: Record<string, string> = {}
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue
        const status = line.substring(0, 2).trim()
        const filePath = line.substring(3).trim()
        // eslint-disable-next-line security/detect-object-injection -- filePath is a sanitized string from git output, not user-controlled
        if (filePath) files[filePath] = status
      }
      execFile('git', ['branch', '--show-current'], { cwd, timeout: 5_000 }, (branchError, branchOut) => {
        resolve({ branch: branchError ? 'unknown' : branchOut.trim(), files, cwd })
      })
    })
  })
}

function mapGitStatus(rawStatus: string): GitDiffFileSummary['status'] {
  if (rawStatus.includes('?') || rawStatus.includes('A')) return 'added'
  if (rawStatus.includes('D')) return 'deleted'
  if (rawStatus.includes('R')) return 'renamed'
  if (rawStatus.includes('M')) return 'modified'
  return 'unknown'
}

function normalizeRenamedDiffPath(filePath: string): string {
  if (!filePath.includes(' => ')) return filePath
  if (filePath.includes('{') && filePath.includes('}')) {
     
    return filePath.replace(/\{[^{}]* => ([^{}]*)\}/g, '$1')
  }
  return filePath.slice(filePath.lastIndexOf(' => ') + 4)
}

function parseNumstatLine(rootPath: string, line: string): GitDiffFileSummary | null {
  const parts = line.split('\t')
  if (parts.length < 3) return null
  const filePath = path.resolve(rootPath, normalizeRenamedDiffPath(parts[2]))
  return {
    filePath,
    additions: parts[0] === '-' ? 0 : Number(parts[0]),
    deletions: parts[1] === '-' ? 0 : Number(parts[1]),
    status: 'modified',
  }
}

function readStatusFileMap(response: Record<string, unknown>): Record<string, string> {
  const files = response.files
  if (!files || typeof files !== 'object') return {}
  return Object.fromEntries(
    Object.entries(files).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
  )
}

function createEmptyGitDiffSummary(generatedAt: number): GitDiffSummary {
  return { changedFiles: [], totalAdditions: 0, totalDeletions: 0, changedFileCount: 0, generatedAt }
}

function summarizeGitDiff(changedFiles: GitDiffFileSummary[], generatedAt: number, currentBranch?: string): GitDiffSummary {
  const ordered = changedFiles.sort((left, right) => left.filePath.localeCompare(right.filePath))
  return {
    changedFiles: ordered,
    totalAdditions: ordered.reduce((total, file) => total + file.additions, 0),
    totalDeletions: ordered.reduce((total, file) => total + file.deletions, 0),
    changedFileCount: ordered.length,
    comparedAgainst: 'HEAD',
    currentBranch,
    generatedAt,
  }
}

function parseHunkLine(line: string): { startLine: number; lineCount: number } | null {
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded by @@ delimiters, no catastrophic backtracking possible
  const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
  if (!match) return null
  const startLine = parseInt(match[1], 10)
  const lineCount = match[2] !== undefined ? parseInt(match[2], 10) : 1
  return lineCount > 0 ? { startLine, lineCount } : null
}

function registerHunkFile(hunks: Map<string, GitDiffHunk[]>, line: string, rootPath: string): string {
  const currentFile = path.resolve(rootPath, line.slice(6))
  if (!hunks.has(currentFile)) hunks.set(currentFile, [])
  return currentFile
}

function processDiffLine(hunks: Map<string, GitDiffHunk[]>, line: string, currentFile: string | null, rootPath: string): string | null {
  if (line.startsWith('+++ b/')) return registerHunkFile(hunks, line, rootPath)
  if (!line.startsWith('@@') || !currentFile) return currentFile
  const parsed = parseHunkLine(line)
  if (!parsed) return currentFile
  const fileHunks = hunks.get(currentFile)!
  if (fileHunks.length < MAX_HUNKS_PER_FILE) fileHunks.push(parsed)
  return currentFile
}

export async function parseDiffHunks(rootPath: string): Promise<Map<string, GitDiffHunk[]>> {
  const hunks = new Map<string, GitDiffHunk[]>()
  try {
    const stdout = await execGit(rootPath, ['diff', 'HEAD', '--unified=0', '--diff-filter=ACMR'])
    let currentFile: string | null = null
    for (const line of stdout.split(/\r?\n/)) {
      currentFile = processDiffLine(hunks, line, currentFile, rootPath)
    }
  } catch {
    // git diff failed — return empty map
  }
  return hunks
}

function buildChangedFiles(statusFiles: Record<string, string>, rootPath: string): Map<string, GitDiffFileSummary> {
  const changedFiles = new Map<string, GitDiffFileSummary>()
  for (const [relativePath, rawStatus] of Object.entries(statusFiles)) {
    const absolutePath = path.resolve(rootPath, relativePath)
    changedFiles.set(normalizePathForCompare(absolutePath), {
      filePath: absolutePath, additions: 0, deletions: 0, status: mapGitStatus(rawStatus),
    })
  }
  return changedFiles
}

async function applyNumstat(rootPath: string, changedFiles: Map<string, GitDiffFileSummary>): Promise<void> {
  const diffStdout = await execGit(rootPath, ['diff', '--numstat', '--find-renames', 'HEAD'])
  for (const line of diffStdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parsed = parseNumstatLine(rootPath, line)
    if (!parsed) continue
    const lookupKey = normalizePathForCompare(parsed.filePath)
    const existing = changedFiles.get(lookupKey)
    changedFiles.set(lookupKey, existing
      ? { ...existing, additions: parsed.additions, deletions: parsed.deletions, status: existing.status }
      : parsed)
  }
}

export async function buildGitDiffSummary(rootPath: string, generatedAt: number): Promise<GitDiffSummary> {
  const emptySummary = createEmptyGitDiffSummary(generatedAt)
  let statusResponse: Record<string, unknown>
  try {
    statusResponse = await execGitStatus(rootPath)
  } catch {
    return emptySummary
  }
  const statusFiles = readStatusFileMap(statusResponse)
  if (statusResponse.error && Object.keys(statusFiles).length === 0) return emptySummary
  const changedFiles = buildChangedFiles(statusFiles, rootPath)
  const branch = typeof statusResponse.branch === 'string' && statusResponse.branch !== '' ? statusResponse.branch : undefined
  try {
    await applyNumstat(rootPath, changedFiles)
  } catch {
    return summarizeGitDiff(Array.from(changedFiles.values()), generatedAt, branch)
  }
  const hunksByFile = await parseDiffHunks(rootPath)
  for (const [filePath, fileHunks] of hunksByFile) {
    const key = normalizePathForCompare(filePath)
    const existing = changedFiles.get(key)
    if (existing) changedFiles.set(key, { ...existing, hunks: fileHunks })
  }
  return summarizeGitDiff(Array.from(changedFiles.values()), generatedAt, branch)
}

export async function buildRecentCommits(rootPath: string, count = 5): Promise<RecentCommit[]> {
  try {
    const stdout = await execGit(rootPath, ['log', `--oneline`, `-${count}`, '--format=%H|%s|%aI'])
    return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [hash, ...rest] = line.split('|')
      const message = rest.slice(0, -1).join('|')
      const authorDate = rest[rest.length - 1]
      return { hash: hash.slice(0, 8), message, authorDate }
    })
  } catch {
    return []
  }
}

function mergeFileDiagnostics(existing: DiagnosticsFileSummary, file: DiagnosticsFileSummary): void {
  existing.errors += file.errors
  existing.warnings += file.warnings
  existing.infos += file.infos
  existing.hints += file.hints
  if (file.messages && file.messages.length > 0) {
    const combined = [...(existing.messages ?? []), ...file.messages]
    combined.sort(
      (left, right) =>
        (SEVERITY_PRIORITY[left.severity] ?? 3) - (SEVERITY_PRIORITY[right.severity] ?? 3) ||
        left.line - right.line,
    )
    existing.messages = combined.slice(0, MAX_MESSAGES_PER_FILE)
  }
}

function applyGlobalMessageCap(files: DiagnosticsFileSummary[]): void {
  let totalMessages = 0
  for (const file of files) {
    if (!file.messages) continue
    const remaining = MAX_MESSAGES_TOTAL - totalMessages
    if (remaining <= 0) { file.messages = []; continue }
    if (file.messages.length > remaining) file.messages = file.messages.slice(0, remaining)
    totalMessages += file.messages.length
  }
}

export function aggregateDiagnostics(rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number): DiagnosticsSummary {
  const merged = new Map<string, DiagnosticsFileSummary>()
  for (const snapshot of rootSnapshots) {
    for (const file of snapshot.diagnostics.files) {
      const key = normalizePathForCompare(file.filePath)
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, { ...file, messages: file.messages ? [...file.messages] : undefined })
        continue
      }
      mergeFileDiagnostics(existing, file)
    }
  }
  const files = Array.from(merged.values()).sort((left, right) => left.filePath.localeCompare(right.filePath))
  applyGlobalMessageCap(files)
  return {
    files,
    totalErrors: files.reduce((total, file) => total + file.errors, 0),
    totalWarnings: files.reduce((total, file) => total + file.warnings, 0),
    totalInfos: files.reduce((total, file) => total + file.infos, 0),
    totalHints: files.reduce((total, file) => total + file.hints, 0),
    generatedAt,
  }
}

export function aggregateGitDiff(rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number): GitDiffSummary {
  const merged = new Map<string, GitDiffFileSummary>()
  for (const snapshot of rootSnapshots) {
    for (const file of snapshot.gitDiff.changedFiles) {
      merged.set(normalizePathForCompare(file.filePath), file)
    }
  }
  const files = Array.from(merged.values()).sort((left, right) => left.filePath.localeCompare(right.filePath))
  const currentBranch = rootSnapshots.find(s => s.gitDiff.currentBranch)?.gitDiff.currentBranch
  return {
    changedFiles: files,
    totalAdditions: files.reduce((total, file) => total + file.additions, 0),
    totalDeletions: files.reduce((total, file) => total + file.deletions, 0),
    changedFileCount: files.length,
    comparedAgainst: files.length > 0 ? 'HEAD' : undefined,
    currentBranch,
    generatedAt,
  }
}

export function aggregateRecentEdits(rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number, maxRecentFiles: number): RecentEditsSummary {
  const files = rootSnapshots.flatMap((snapshot) => snapshot.files)
  return { files: takeRecentFiles(files, maxRecentFiles), generatedAt }
}

export function aggregateRepoFacts(workspaceRoots: string[], rootSnapshots: RootRepoIndexSnapshot[], generatedAt: number, maxRecentFiles: number): RepoFacts {
  const gitDiff = aggregateGitDiff(rootSnapshots, generatedAt)
  const diagnostics = aggregateDiagnostics(rootSnapshots, generatedAt)
  const recentEdits = aggregateRecentEdits(rootSnapshots, generatedAt, maxRecentFiles)
  const recentCommits = rootSnapshots.find(s => s.recentCommits.length > 0)?.recentCommits
  return { workspaceRoots, roots: rootSnapshots.map((snapshot) => snapshot.workspaceFact), gitDiff, diagnostics, recentEdits, recentCommits }
}
