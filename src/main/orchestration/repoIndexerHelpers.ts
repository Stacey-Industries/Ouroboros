import { createHash } from 'crypto'
import path from 'path'

import type { IndexedRepoDirectory, IndexedRepoFile, IndexedRepoFileDiagnostics, RootRepoIndexSnapshot } from './repoIndexer'
import type { DiagnosticsFileSummary, DiagnosticsSummary } from './types'

export function normalizePathForCompare(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function toRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join('/')
}

export function detectExtension(name: string): string {
  if (name.endsWith('.d.ts')) return '.d.ts'
  return path.extname(name).toLowerCase()
}

export function toIndexedDiagnostics(summary: DiagnosticsFileSummary): IndexedRepoFileDiagnostics {
  const total = summary.errors + summary.warnings + summary.infos + summary.hints
  return { errors: summary.errors, warnings: summary.warnings, infos: summary.infos, hints: summary.hints, total }
}

export function takeRecentFiles(files: IndexedRepoFile[], maxRecentFiles: number): string[] {
  return [...files]
    .sort((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path))
    .slice(0, maxRecentFiles)
    .map((file) => file.path)
}

export function summarizeLanguages(files: IndexedRepoFile[]): string[] {
  const counts = new Map<string, number>()
  for (const file of files) {
    if (file.language === 'unknown') continue
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([language]) => language)
}

export function emptyDiagnosticsSummary(generatedAt: number): DiagnosticsSummary {
  return { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt }
}

export function normalizeWorkspaceRoots(workspaceRoots: string[]): string[] {
  const seen = new Set<string>()
  const roots: string[] = []
  for (const root of workspaceRoots) {
    if (typeof root !== 'string' || root.trim() === '') continue
    const resolved = path.resolve(root)
    const key = normalizePathForCompare(resolved)
    if (seen.has(key)) continue
    seen.add(key)
    roots.push(resolved)
  }
  return roots
}

export function buildRootLookupKey(rootPath: string, stateKey: string | undefined): string {
  return `${normalizePathForCompare(rootPath)}::${stateKey ?? ''}`
}

export function buildWorkspaceLookupKey(workspaceRoots: string[], workspaceStateKey?: string): string | null {
  if (!workspaceStateKey) return null
  return buildRootLookupKey(workspaceRoots.join('|'), workspaceStateKey)
}

export function createWorkspaceStateKey(rootSnapshots: RootRepoIndexSnapshot[]): string {
  const hash = createHash('sha1')
  for (const snapshot of [...rootSnapshots].sort((left, right) => left.rootPath.localeCompare(right.rootPath))) {
    hash.update(`${normalizePathForCompare(snapshot.rootPath)}|${snapshot.stateKey}`)
  }
  return hash.digest('hex')
}

export function createRootStateKey(input: {
  rootPath: string
  fileCount: number
  directoryCount: number
  files: IndexedRepoFile[]
  directories: IndexedRepoDirectory[]
  gitDiff: { changedFiles: Array<{ filePath: string; status: string; additions: number; deletions: number }> }
  diagnostics: DiagnosticsSummary
}): string {
  const hash = createHash('sha1')
  hash.update(normalizePathForCompare(input.rootPath))
  hash.update(`files:${input.fileCount}|dirs:${input.directoryCount}`)
  for (const file of input.files) {
    hash.update(`${file.relativePath}|${file.modifiedAt}|${file.size}|${file.language}|${file.imports.join(',')}`)
    if (file.diagnostics) {
      hash.update(`|diag:${file.diagnostics.errors},${file.diagnostics.warnings},${file.diagnostics.infos},${file.diagnostics.hints}`)
    }
  }
  for (const directory of input.directories) {
    hash.update(`${directory.relativePath}|${directory.modifiedAt}`)
  }
  for (const changedFile of input.gitDiff.changedFiles) {
    hash.update(`${changedFile.filePath}|${changedFile.status}|${changedFile.additions}|${changedFile.deletions}`)
  }
  for (const diagnostic of input.diagnostics.files) {
    hash.update(`${diagnostic.filePath}|${diagnostic.errors}|${diagnostic.warnings}|${diagnostic.infos}|${diagnostic.hints}`)
  }
  return hash.digest('hex')
}
