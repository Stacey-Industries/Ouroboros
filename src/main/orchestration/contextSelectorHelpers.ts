import path from 'path'

import {
  type ContextFileSnapshot,
  escapeRegExp,
  resolveWorkspaceFile,
  toPathKey,
  uniqueFiles,
} from './contextSelectionSupport'
import type {
  ContextConfidence,
  ContextReasonKind,
  ContextSelectionReason,
  LiveIdeState,
  OmittedContextCandidate,
  RankedContextFile,
  RepoFacts,
  TaskRequest,
} from './types'

export interface MutableCandidate {
  filePath: string
  reasons: ContextSelectionReason[]
  /** Wave 29.5 Phase D: PageRank score set by tryApplyPageRank; null until graph runs. */
  pagerank_score?: number | null
}

export interface NormalizedSelection {
  selectedFiles: string[]
  pinnedFiles: string[]
  includedFiles: string[]
  excludedFiles: string[]
}

const CONFIDENCE_ORDER = new Map<ContextConfidence, number>([['high', 0], ['medium', 1], ['low', 2]])

export function addReason(candidate: MutableCandidate, kind: ContextReasonKind, detail: string, weight: number): void {
  const reasonKey = `${kind}:${detail}`
  if (candidate.reasons.some((reason) => `${reason.kind}:${reason.detail}` === reasonKey)) return
  candidate.reasons.push({ kind, weight, detail })
}

function sortReasons(reasons: ContextSelectionReason[]): ContextSelectionReason[] {
  return [...reasons].sort((left, right) => {
    if (right.weight !== left.weight) return right.weight - left.weight
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind)
    return left.detail.localeCompare(right.detail)
  })
}

function scoreCandidate(reasons: ContextSelectionReason[]): number {
  return reasons.reduce((total, reason) => total + reason.weight, 0)
}

function confidenceFor(reasons: ContextSelectionReason[], score: number): ContextConfidence {
  if (reasons.some((reason) => ['user_selected', 'pinned', 'included', 'dirty_buffer'].includes(reason.kind))) return 'high'
  if (score >= 80 || reasons.some((reason) => ['git_diff', 'diagnostic'].includes(reason.kind))) return 'high'
  return score >= 35 || reasons.length >= 2 ? 'medium' : 'low'
}

export function getOrCreateCandidate(candidates: Map<string, MutableCandidate>, filePath: string): MutableCandidate {
  const key = toPathKey(filePath)
  const existing = candidates.get(key)
  if (existing) return existing
  const next = { filePath, reasons: [] }
  candidates.set(key, next)
  return next
}

export function pushOmitted(target: OmittedContextCandidate[], seen: Set<string>, filePath: string, reason: string): void {
  const key = `${toPathKey(filePath)}:${reason}`
  if (seen.has(key)) return
  seen.add(key)
  target.push({ filePath, reason })
}

export async function normalizeSelection(request: TaskRequest, workspaceRoots: string[]): Promise<NormalizedSelection> {
  const normalize = (filePaths: string[]) => Promise.all(filePaths.map((filePath) => resolveWorkspaceFile(filePath, workspaceRoots)))
  const selectedFiles = uniqueFiles(await normalize(request.contextSelection?.userSelectedFiles ?? []))
  const pinnedFiles = uniqueFiles(await normalize(request.contextSelection?.pinnedFiles ?? []))
  const includedFiles = uniqueFiles(await normalize(request.contextSelection?.includedFiles ?? []))
  const excludedFiles = uniqueFiles(await normalize(request.contextSelection?.excludedFiles ?? []))
  return { selectedFiles, pinnedFiles, includedFiles, excludedFiles }
}

export async function resolveRecentEdits(repoFacts: RepoFacts, workspaceRoots: string[]): Promise<string[]> {
  return uniqueFiles(await Promise.all([
    ...repoFacts.recentEdits.files.map((filePath) => resolveWorkspaceFile(filePath, workspaceRoots)),
    ...repoFacts.roots.flatMap((root) => root.recentlyEditedFiles.map((filePath) => resolveWorkspaceFile(filePath, workspaceRoots, root.rootPath))),
  ]))
}

export async function resolveDiagnosticFiles(repoFacts: RepoFacts, workspaceRoots: string[]): Promise<string[]> {
  return uniqueFiles(await Promise.all(repoFacts.diagnostics.files.map((file) => resolveWorkspaceFile(file.filePath, workspaceRoots))))
}

export async function resolveDiffFiles(repoFacts: RepoFacts, workspaceRoots: string[]): Promise<string[]> {
  return uniqueFiles(await Promise.all(repoFacts.gitDiff.changedFiles.map((file) => resolveWorkspaceFile(file.filePath, workspaceRoots))))
}

export function rankCandidates(candidates: Map<string, MutableCandidate>): RankedContextFile[] {
  return Array.from(candidates.values())
    .map((candidate) => {
      const reasons = sortReasons(candidate.reasons)
      const score = scoreCandidate(reasons)
      return { filePath: candidate.filePath, score, confidence: confidenceFor(reasons, score), reasons, snippets: [], truncationNotes: [], pagerank_score: candidate.pagerank_score ?? null } satisfies RankedContextFile
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (left.confidence !== right.confidence) return (CONFIDENCE_ORDER.get(left.confidence) ?? 2) - (CONFIDENCE_ORDER.get(right.confidence) ?? 2)
      return left.filePath.localeCompare(right.filePath)
    })
}

export function findRelatedSeeds(
  candidate: MutableCandidate,
  snapshots: Map<string, ContextFileSnapshot>,
  seedFiles: string[],
): string[] {
  const candidateImports = extractImportSpecifiers(snapshots.get(toPathKey(candidate.filePath))?.content ?? null)
  const related = new Set<string>()
  for (const seedFile of seedFiles) {
    if (toPathKey(seedFile) === toPathKey(candidate.filePath)) continue
    const seedImports = extractImportSpecifiers(snapshots.get(toPathKey(seedFile))?.content ?? null)
    const isRelated = referencesTarget(candidate.filePath, seedFile, candidateImports)
      || referencesTarget(seedFile, candidate.filePath, seedImports)
    if (isRelated) related.add(path.basename(seedFile))
    if (related.size === 3) break
  }
  return Array.from(related)
}

export function buildSeedFiles(
  selection: NormalizedSelection,
  liveIdeState: LiveIdeState,
  diffFiles: string[],
  diagnosticFiles: string[],
): string[] {
  return uniqueFiles([
    ...selection.selectedFiles,
    ...selection.pinnedFiles,
    ...selection.includedFiles,
    ...liveIdeState.openFiles,
    ...liveIdeState.dirtyFiles,
    ...diffFiles,
    ...diagnosticFiles,
    ...(liveIdeState.activeFile ? [liveIdeState.activeFile] : []),
  ])
}

export function extractKeywords(
  goal: string,
  stopWords: ReadonlySet<string>,
  limit = 12,
): string[] {
  const tokens: string[] = []
  for (const raw of goal.split(/\s+/)) {
    const stripped = raw.replace(/^[^\w]+|[^\w]+$/g, '')
    if (!stripped) continue
    for (const part of stripped.split(/[-_]+/)) {
      for (const sub of part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')) {
        tokens.push(sub.toLowerCase())
      }
    }
  }
  return [
    ...new Set(tokens.filter((t) => t.length >= 3 && !stopWords.has(t) && !/^\d+$/.test(t))),
  ].slice(0, limit)
}

export function findKeywordMatches(
  filePath: string,
  content: string | null,
  keywords: string[],
): string[] {
  const pathValue = filePath.toLowerCase()
  const matches: string[] = []
  for (const keyword of keywords) {
    if (
      pathValue.includes(keyword) ||
      // eslint-disable-next-line security/detect-non-literal-regexp -- keyword is escaped via escapeRegExp above
      (content && new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(content))
    ) {
      matches.push(keyword)
    }
  }
  return matches
}

function extractImportSpecifiers(content: string | null): string[] {
  if (!content) return []
  return Array.from(
    content.matchAll(
      /(?:import\s+[^'"]*from\s*|export\s+[^'"]*from\s*|require\()\s*['"]([^'"]+)['"]/g,
    ),
  ).flatMap((match) => (match[1] ? [match[1]] : []))
}

function referencesTarget(
  sourceFile: string,
  targetFile: string,
  imports: string[],
): boolean {
  const relativeValue = path.posix
    .normalize(path.relative(path.dirname(sourceFile), targetFile).replace(/\\/g, '/'))
    .replace(/\.(tsx?|jsx?|mjs|cjs|json)$/i, '')
    .replace(/\/index$/i, '')
  const baseValue = path.basename(targetFile).replace(/\.(tsx?|jsx?|mjs|cjs|json)$/i, '')
  const candidates = new Set([
    relativeValue,
    relativeValue.startsWith('.') ? relativeValue : `./${relativeValue}`,
    baseValue,
  ])
  return imports.some(
    (entry) =>
      candidates.has(
        entry
          .replace(/\\/g, '/')
          .replace(/\.(tsx?|jsx?|mjs|cjs|json)$/i, '')
          .replace(/\/index$/i, ''),
      ) || entry.endsWith(`/${baseValue}`),
  )
}
