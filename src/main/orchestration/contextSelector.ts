import fs from 'fs/promises'
import path from 'path'

import {
  collectLiveIdeState,
  type ContextFileSnapshot,
  getPersistentSnapshotCache,
  loadContextFileSnapshotFast,
  resolveWorkspaceFile,
  toPathKey,
  uniqueFiles,
} from './contextSelectionSupport'
import {
  addReason,
  buildSeedFiles,
  extractKeywords,
  findKeywordMatches,
  findRelatedSeeds,
  getOrCreateCandidate,
  type MutableCandidate,
  type NormalizedSelection,
  normalizeSelection,
  pushOmitted,
  rankCandidates,
  resolveDiagnosticFiles,
  resolveDiffFiles,
  resolveRecentEdits,
} from './contextSelectorHelpers'
import type {
  ContextReasonKind,
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

const REASON_WEIGHTS = new Map<ContextReasonKind, number>([
  ['user_selected', 100],
  ['pinned', 95],
  ['included', 85],
  ['active_file', 0],
  ['open_file', 0],
  ['dirty_buffer', 68],
  ['test_companion', 38],
  ['recent_edit', 32],
  ['git_diff', 56],
  ['diagnostic', 52],
  ['keyword_match', 26],
  ['import_adjacency', 22],
  ['dependency', 12],
  ['semantic_match', 45],
])

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'build', 'by', 'current', 'do', 'edit', 'feature', 'file', 'files',
  'fix', 'for', 'from', 'in', 'into', 'is', 'it', 'make', 'mode', 'new', 'of', 'on', 'or', 'plan',
  'task', 'that', 'the', 'this', 'to', 'update', 'with', 'without', 'you', 'your',
])

function addWeightedReason(candidate: MutableCandidate, kind: ContextReasonKind, detail: string): void {
  addReason(candidate, kind, detail, REASON_WEIGHTS.get(kind) ?? 0)
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
    addWeightedReason(getOrCreateCandidate(candidates, filePath), kind, detail)
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
  const kwWeight = REASON_WEIGHTS.get('keyword_match') ?? 26
  for (const candidate of candidates.values()) {
    const pathHits = findKeywordMatches(candidate.filePath, null, keywords)
    if (pathHits.length >= 3) {
      addReason(candidate, 'keyword_match', `Matches keywords: ${pathHits.join(', ')}`, kwWeight + pathHits.length - 1)
      continue
    }
    const snapshot = await loadContextFileSnapshotFast(candidate.filePath, snapshots)
    const keywordHits = findKeywordMatches(candidate.filePath, snapshot.content, keywords)
    if (keywordHits.length > 0) addReason(candidate, 'keyword_match', `Matches keywords: ${keywordHits.join(', ')}`, kwWeight + keywordHits.length - 1)
  }
}

function applyImportAdjacency(
  candidates: Map<string, MutableCandidate>,
  snapshots: Map<string, ContextFileSnapshot>,
  seedFiles: string[],
): void {
  const iaWeight = REASON_WEIGHTS.get('import_adjacency') ?? 22
  for (const candidate of candidates.values()) {
    const related = findRelatedSeeds(candidate, snapshots, seedFiles)
    if (related.length > 0) addReason(candidate, 'import_adjacency', `Import-adjacent to ${related.join(', ')}`, iaWeight + related.length - 1)
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
      if (await fileExists(testPath)) addCandidate(testPath, 'test_companion', `Test file for ${base}${ext}`)
    }
  }
}

function buildDiffHunksMap(repoFacts: RepoFacts): Map<string, GitDiffHunk[]> {
  const diffHunksMap = new Map<string, GitDiffHunk[]>()
  for (const file of repoFacts.gitDiff.changedFiles) {
    if (file.hunks?.length) diffHunksMap.set(toPathKey(file.filePath), file.hunks)
  }
  return diffHunksMap
}

function buildResult(options: {
  selection: NormalizedSelection; liveIdeState: LiveIdeState; recentEdits: string[]; diffFiles: string[]
  diagnosticFiles: string[]; keywords: string[]; candidates: Map<string, MutableCandidate>
  omittedCandidates: OmittedContextCandidate[]; snapshots: Map<string, ContextFileSnapshot>; diffHunksMap: Map<string, GitDiffHunk[]>
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
      userSelectedFiles: selection.selectedFiles, pinnedFiles: selection.pinnedFiles,
      includedFiles: selection.includedFiles, excludedFiles: selection.excludedFiles,
      activeFile: liveIdeState.activeFile, openFiles: liveIdeState.openFiles,
      dirtyFiles: liveIdeState.dirtyFiles, recentEdits, diffFiles, diagnosticFiles, keywordMatches: keywords,
    },
    rankedFiles,
    omittedCandidates,
    snapshots: Object.fromEntries(Array.from(snapshots.values()).map((snapshot) => [toPathKey(snapshot.filePath), snapshot])),
  }
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
  return buildResult({ selection, liveIdeState, recentEdits, diffFiles, diagnosticFiles, keywords, candidates, omittedCandidates, snapshots, diffHunksMap: buildDiffHunksMap(repoFacts) })
}
