import fs from 'fs/promises'
import path from 'path'
import {
  type ContextFileSnapshot,
  collectLiveIdeState,
  extractImportSpecifiers,
  extractKeywords,
  findKeywordMatches,
  getPersistentSnapshotCache,
  loadContextFileSnapshotFast,
  referencesTarget,
  resolveWorkspaceFile,
  toPathKey,
  uniqueFiles,
} from './contextSelectionSupport'
import type {
  ContextConfidence,
  ContextReasonKind,
  ContextSelectionReason,
  GitDiffHunk,
  LiveIdeState,
  OmittedContextCandidate,
  RankedContextFile,
  RepoFacts,
  TaskRequest,
} from './types'

export interface ContextRankingInputs {
  userSelectedFiles: string[]
  pinnedFiles: string[]
  includedFiles: string[]
  excludedFiles: string[]
  activeFile?: string
  openFiles: string[]
  dirtyFiles: string[]
  recentEdits: string[]
  diffFiles: string[]
  diagnosticFiles: string[]
  keywordMatches: string[]
}

export interface ContextSelectionResult {
  liveIdeState: LiveIdeState
  rankingInputs: ContextRankingInputs
  rankedFiles: RankedContextFile[]
  omittedCandidates: OmittedContextCandidate[]
  snapshots: Record<string, ContextFileSnapshot>
}

interface MutableCandidate {
  filePath: string
  reasons: ContextSelectionReason[]
}

interface NormalizedSelection {
  selectedFiles: string[]
  pinnedFiles: string[]
  includedFiles: string[]
  excludedFiles: string[]
}

const REASON_WEIGHTS: Record<ContextReasonKind, number> = {
  user_selected: 100,
  pinned: 95,
  included: 85,
  active_file: 0,
  open_file: 0,
  dirty_buffer: 68,
  test_companion: 38,
  recent_edit: 32,
  git_diff: 56,
  diagnostic: 52,
  keyword_match: 26,
  import_adjacency: 22,
  dependency: 12,
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'build', 'by', 'current', 'do', 'edit', 'feature', 'file', 'files',
  'fix', 'for', 'from', 'in', 'into', 'is', 'it', 'make', 'mode', 'new', 'of', 'on', 'or', 'plan',
  'task', 'that', 'the', 'this', 'to', 'update', 'with', 'without', 'you', 'your',
])

const CONFIDENCE_ORDER: Record<ContextConfidence, number> = { high: 0, medium: 1, low: 2 }

function addReason(candidate: MutableCandidate, kind: ContextReasonKind, detail: string, weight = REASON_WEIGHTS[kind]): void {
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
  if (reasons.some((reason) => ['user_selected', 'pinned', 'included', 'dirty_buffer', 'active_file'].includes(reason.kind))) return 'high'
  if (score >= 80 || reasons.some((reason) => ['git_diff', 'diagnostic'].includes(reason.kind))) return 'high'
  return score >= 35 || reasons.length >= 2 ? 'medium' : 'low'
}

function getOrCreateCandidate(candidates: Map<string, MutableCandidate>, filePath: string): MutableCandidate {
  const key = toPathKey(filePath)
  const existing = candidates.get(key)
  if (existing) return existing
  const next = { filePath, reasons: [] }
  candidates.set(key, next)
  return next
}

function pushOmitted(target: OmittedContextCandidate[], seen: Set<string>, filePath: string, reason: string): void {
  const key = `${toPathKey(filePath)}:${reason}`
  if (seen.has(key)) return
  seen.add(key)
  target.push({ filePath, reason })
}

async function normalizeSelection(request: TaskRequest, workspaceRoots: string[]): Promise<NormalizedSelection> {
  const normalize = (filePaths: string[]) => Promise.all(filePaths.map((filePath) => resolveWorkspaceFile(filePath, workspaceRoots)))
  const selectedFiles = uniqueFiles(await normalize(request.contextSelection?.userSelectedFiles ?? []))
  const pinnedFiles = uniqueFiles(await normalize(request.contextSelection?.pinnedFiles ?? []))
  const includedFiles = uniqueFiles(await normalize(request.contextSelection?.includedFiles ?? []))
  const excludedFiles = uniqueFiles(await normalize(request.contextSelection?.excludedFiles ?? []))
  return { selectedFiles, pinnedFiles, includedFiles, excludedFiles }
}

async function resolveRecentEdits(repoFacts: RepoFacts, workspaceRoots: string[]): Promise<string[]> {
  return uniqueFiles(await Promise.all([
    ...repoFacts.recentEdits.files.map((filePath) => resolveWorkspaceFile(filePath, workspaceRoots)),
    ...repoFacts.roots.flatMap((root) => root.recentlyEditedFiles.map((filePath) => resolveWorkspaceFile(filePath, workspaceRoots, root.rootPath))),
  ]))
}

async function resolveDiagnosticFiles(repoFacts: RepoFacts, workspaceRoots: string[]): Promise<string[]> {
  return uniqueFiles(await Promise.all(repoFacts.diagnostics.files.map((file) => resolveWorkspaceFile(file.filePath, workspaceRoots))))
}

async function resolveDiffFiles(repoFacts: RepoFacts, workspaceRoots: string[]): Promise<string[]> {
  return uniqueFiles(await Promise.all(repoFacts.gitDiff.changedFiles.map((file) => resolveWorkspaceFile(file.filePath, workspaceRoots))))
}

function addCandidateFactory(
  candidates: Map<string, MutableCandidate>,
  excludedKeys: Set<string>,
  omittedCandidates: OmittedContextCandidate[],
  omittedKeys: Set<string>,
): (filePath: string, kind: ContextReasonKind, detail: string) => void {
  return (filePath, kind, detail) => {
    if (!filePath) return
    if (excludedKeys.has(toPathKey(filePath))) return void pushOmitted(omittedCandidates, omittedKeys, filePath, 'Excluded by request')
    addReason(getOrCreateCandidate(candidates, filePath), kind, detail)
  }
}

function addBaseCandidates(addCandidate: (filePath: string, kind: ContextReasonKind, detail: string) => void, selection: NormalizedSelection, liveIdeState: LiveIdeState): void {
  for (const filePath of selection.selectedFiles) addCandidate(filePath, 'user_selected', 'Explicitly selected for this task')
  for (const filePath of selection.pinnedFiles) addCandidate(filePath, 'pinned', 'Pinned into the context set')
  for (const filePath of selection.includedFiles) addCandidate(filePath, 'included', 'Included by request context settings')
  if (liveIdeState.activeFile) addCandidate(liveIdeState.activeFile, 'active_file', 'Currently active editor file')
  for (const filePath of liveIdeState.openFiles) addCandidate(filePath, 'open_file', 'Currently open in the editor')
  for (const filePath of liveIdeState.dirtyFiles) addCandidate(filePath, 'dirty_buffer', 'Unsaved editor changes are present')
}

async function addRepoFactCandidates(
  addCandidate: (filePath: string, kind: ContextReasonKind, detail: string) => void,
  repoFacts: RepoFacts,
  workspaceRoots: string[],
): Promise<{ recentEdits: string[]; diffFiles: string[]; diagnosticFiles: string[] }> {
  const [recentEdits, diffFiles, diagnosticFiles] = await Promise.all([
    resolveRecentEdits(repoFacts, workspaceRoots),
    resolveDiffFiles(repoFacts, workspaceRoots),
    resolveDiagnosticFiles(repoFacts, workspaceRoots),
  ])
  for (const filePath of recentEdits) addCandidate(filePath, 'recent_edit', 'Recently edited in the workspace')
  for (const filePath of diffFiles) addCandidate(filePath, 'git_diff', 'Present in the current git diff')
  for (const file of repoFacts.diagnostics.files) {
    addCandidate(await resolveWorkspaceFile(file.filePath, workspaceRoots), 'diagnostic', `Diagnostics: ${file.errors} errors, ${file.warnings} warnings`)
  }
  for (const root of repoFacts.roots) {
    for (const entryPoint of root.entryPoints) {
      addCandidate(await resolveWorkspaceFile(entryPoint, workspaceRoots, root.rootPath), 'dependency', `Workspace entry point for ${path.basename(root.rootPath)}`)
    }
  }
  return { recentEdits, diffFiles, diagnosticFiles }
}

async function applyKeywordReasons(candidates: Map<string, MutableCandidate>, snapshots: Map<string, ContextFileSnapshot>, keywords: string[]): Promise<void> {
  for (const candidate of candidates.values()) {
    // Check file path first (free — no I/O needed)
    const pathHits = findKeywordMatches(candidate.filePath, null, keywords)
    if (pathHits.length >= 3) {
      addReason(candidate, 'keyword_match', `Matches keywords: ${pathHits.join(', ')}`, REASON_WEIGHTS.keyword_match + pathHits.length - 1)
      continue
    }
    // Only load content if path didn't match enough keywords.
    // Use fast loader (fs.readFile) — no IDE socket needed for keyword matching.
    const snapshot = await loadContextFileSnapshotFast(candidate.filePath, snapshots)
    const keywordHits = findKeywordMatches(candidate.filePath, snapshot.content, keywords)
    if (keywordHits.length > 0) addReason(candidate, 'keyword_match', `Matches keywords: ${keywordHits.join(', ')}`, REASON_WEIGHTS.keyword_match + keywordHits.length - 1)
  }
}

function findRelatedSeeds(
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

function applyImportAdjacency(
  candidates: Map<string, MutableCandidate>,
  snapshots: Map<string, ContextFileSnapshot>,
  seedFiles: string[],
): void {
  for (const candidate of candidates.values()) {
    const related = findRelatedSeeds(candidate, snapshots, seedFiles)
    if (related.length > 0) addReason(candidate, 'import_adjacency', `Import-adjacent to ${related.join(', ')}`, REASON_WEIGHTS.import_adjacency + related.length - 1)
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function addTestCompanions(
  candidates: Map<string, MutableCandidate>,
  addCandidate: (filePath: string, kind: ContextReasonKind, detail: string) => void,
): Promise<void> {
  const candidatePaths = Array.from(candidates.keys()).map(key => candidates.get(key)!.filePath)

  for (const candidatePath of candidatePaths) {
    const normalized = path.normalize(candidatePath)
    const ext = path.extname(normalized)
    const base = path.basename(normalized, ext)

    if (base.endsWith('.test') || base.endsWith('.spec')) continue

    const dir = path.dirname(normalized)
    const testPatterns = [
      path.join(dir, `${base}.test${ext}`),
      path.join(dir, `${base}.spec${ext}`),
      path.join(dir, '__tests__', `${base}${ext}`),
      path.join(dir, '__tests__', `${base}.test${ext}`),
    ]

    for (const testPath of testPatterns) {
      if (await fileExists(testPath)) {
        addCandidate(testPath, 'test_companion', `Test file for ${base}${ext}`)
      }
    }
  }
}

function rankCandidates(candidates: Map<string, MutableCandidate>): RankedContextFile[] {
  return Array.from(candidates.values())
    .map((candidate) => {
      const reasons = sortReasons(candidate.reasons)
      const score = scoreCandidate(reasons)
      return { filePath: candidate.filePath, score, confidence: confidenceFor(reasons, score), reasons, snippets: [], truncationNotes: [] } satisfies RankedContextFile
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (left.confidence !== right.confidence) return CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
      return left.filePath.localeCompare(right.filePath)
    })
}

function buildSelectionResult(options: {
  selection: NormalizedSelection
  liveIdeState: LiveIdeState
  recentEdits: string[]
  diffFiles: string[]
  diagnosticFiles: string[]
  keywords: string[]
  candidates: Map<string, MutableCandidate>
  omittedCandidates: OmittedContextCandidate[]
  snapshots: Map<string, ContextFileSnapshot>
  diffHunksMap: Map<string, GitDiffHunk[]>
}): ContextSelectionResult {
  const { selection, liveIdeState, recentEdits, diffFiles, diagnosticFiles, keywords, candidates, omittedCandidates, snapshots, diffHunksMap } = options
  const rankedFiles = rankCandidates(candidates)
  for (const ranked of rankedFiles) {
    const hunks = diffHunksMap.get(toPathKey(ranked.filePath))
    if (hunks) ranked.hunks = hunks
  }
  return {
    liveIdeState,
    rankingInputs: {
      userSelectedFiles: selection.selectedFiles,
      pinnedFiles: selection.pinnedFiles,
      includedFiles: selection.includedFiles,
      excludedFiles: selection.excludedFiles,
      activeFile: liveIdeState.activeFile,
      openFiles: liveIdeState.openFiles,
      dirtyFiles: liveIdeState.dirtyFiles,
      recentEdits,
      diffFiles,
      diagnosticFiles,
      keywordMatches: keywords,
    },
    rankedFiles,
    omittedCandidates,
    snapshots: Object.fromEntries(Array.from(snapshots.values()).map((snapshot) => [toPathKey(snapshot.filePath), snapshot])),
  }
}

function buildSeedFiles(
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

export async function selectContextFiles(options: {
  request: TaskRequest
  repoFacts: RepoFacts
  liveIdeState?: LiveIdeState
}): Promise<ContextSelectionResult> {
  const { request, repoFacts } = options
  const workspaceRoots = uniqueFiles(request.workspaceRoots.length > 0 ? request.workspaceRoots : repoFacts.workspaceRoots)
  const selection = await normalizeSelection(request, workspaceRoots)
  const excludedKeys = new Set(selection.excludedFiles.map(toPathKey))
  const omittedCandidates: OmittedContextCandidate[] = []
  const omittedKeys = new Set<string>()
  for (const filePath of selection.excludedFiles) pushOmitted(omittedCandidates, omittedKeys, filePath, 'Excluded by request')
  // Seed from persistent cache so we reuse snapshots from prior builds
  const snapshots = new Map<string, ContextFileSnapshot>(getPersistentSnapshotCache())
  const liveIdeState = options.liveIdeState ?? await collectLiveIdeState(workspaceRoots, selection.selectedFiles, snapshots)
  const candidates = new Map<string, MutableCandidate>()
  const addCandidate = addCandidateFactory(candidates, excludedKeys, omittedCandidates, omittedKeys)
  addBaseCandidates(addCandidate, selection, liveIdeState)
  const { recentEdits, diffFiles, diagnosticFiles } = await addRepoFactCandidates(addCandidate, repoFacts, workspaceRoots)
  await addTestCompanions(candidates, addCandidate)
  const keywords = extractKeywords(request.goal, STOP_WORDS)
  await applyKeywordReasons(candidates, snapshots, keywords)
  applyImportAdjacency(candidates, snapshots, buildSeedFiles(selection, liveIdeState, diffFiles, diagnosticFiles))
  const diffHunksMap = new Map<string, GitDiffHunk[]>()
  for (const file of repoFacts.gitDiff.changedFiles) {
    if (file.hunks?.length) {
      diffHunksMap.set(toPathKey(file.filePath), file.hunks)
    }
  }
  return buildSelectionResult({
    selection,
    liveIdeState,
    recentEdits,
    diffFiles,
    diagnosticFiles,
    keywords,
    candidates,
    omittedCandidates,
    snapshots,
    diffHunksMap,
  })
}
