import fs from 'fs/promises'
import path from 'path'

import { getGraphController } from '../codebaseGraph/graphControllerSupport'
import { computePageRank, normalizePageRankScores } from '../codebaseGraph/graphPageRank'
import { store } from '../config'
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
import { isDiffAgentAuthored, isRecentUserEdit, resolveEditReasonKind } from './contextSelectorProvenance'
import { classifierRankCandidates, runShadowMode } from './contextSelectorRanker'
import { getEditProvenanceStore } from './editProvenance'
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
  liveIdeState: LiveIdeState; rankingInputs: ContextRankingInputs; rankedFiles: RankedContextFile[]
  omittedCandidates: OmittedContextCandidate[]; snapshots: Record<string, ContextFileSnapshot>
}

const REASON_WEIGHTS = new Map<ContextReasonKind, number>([
  ['user_selected', 100],
  ['pinned', 95],
  ['included', 85],
  ['active_file', 0],
  ['open_file', 0],
  ['dirty_buffer', 68],
  ['test_companion', 38],
  // Wave 19: recent_edit preserved as fallback weight when provenance unavailable
  ['recent_edit', 32],
  // Wave 19: provenance-split weights
  ['recent_user_edit', 32],
  ['recent_agent_edit', 4],
  // Wave 19: git_diff default weight (agent-authored path: AGENT_DIFF_WEIGHT)
  ['git_diff', 56],
  ['diagnostic', 52],
  ['keyword_match', 26],
  ['import_adjacency', 22],
  ['dependency', 12],
  // Wave 19: semantic_match removed — no active code path. See Wave 40 for replacement.
  ['semantic_match', 0],
  // Wave 19: pagerank weight is dynamic (normalizedRank × 40)
  ['pagerank', 40],
])

const AGENT_DIFF_WEIGHT = 12
const PAGERANK_SCALE = 40

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'be', 'build', 'by', 'current', 'do', 'edit', 'feature', 'file', 'files', 'fix', 'for', 'from', 'in', 'into', 'is', 'it', 'make', 'mode', 'new', 'of', 'on', 'or', 'plan', 'task', 'that', 'the', 'this', 'to', 'update', 'with', 'without', 'you', 'your'])

function addCandidateFactory(
  candidates: Map<string, MutableCandidate>,
  excludedKeys: Set<string>,
  omittedCandidates: OmittedContextCandidate[],
  omittedKeys: Set<string>,
): (filePath: string, kind: ContextReasonKind, detail: string) => void {
  return (filePath, kind, detail) => {
    if (!filePath) return
    if (excludedKeys.has(toPathKey(filePath))) return void pushOmitted(omittedCandidates, omittedKeys, filePath, 'Excluded by request')
    addReason(getOrCreateCandidate(candidates, filePath), kind, detail, REASON_WEIGHTS.get(kind) ?? 0)
  }
}

function addBaseCandidates(
  addCandidate: (filePath: string, kind: ContextReasonKind, detail: string) => void,
  selection: NormalizedSelection,
  liveIdeState: LiveIdeState,
): void {
  for (const filePath of selection.selectedFiles) addCandidate(filePath, 'user_selected', 'Explicitly selected for this task')
  for (const filePath of selection.pinnedFiles) addCandidate(filePath, 'pinned', 'Pinned into the context set')
  for (const filePath of selection.includedFiles) addCandidate(filePath, 'included', 'Included by request context settings')
  if (liveIdeState.activeFile) addCandidate(liveIdeState.activeFile, 'active_file', 'Currently active editor file')
  for (const filePath of liveIdeState.openFiles) addCandidate(filePath, 'open_file', 'Currently open in the editor')
  for (const filePath of liveIdeState.dirtyFiles) addCandidate(filePath, 'dirty_buffer', 'Unsaved editor changes are present')
}

// ─── Provenance-aware edit and diff reasons ───────────────────────────────────

type GetProv = (p: string) => { lastAgentEditAt: number; lastUserEditAt: number } | null

const makeGetProv = (enabled: boolean): GetProv => { const s = enabled ? getEditProvenanceStore() : null; return s ? (p) => s.getEditProvenance(p) : () => null }

function applyProvenanceEditReasons(
  candidates: Map<string, MutableCandidate>,
  recentEdits: string[],
  provenanceEnabled: boolean,
): void {
  const getProv = makeGetProv(provenanceEnabled)
  for (const filePath of recentEdits) {
    const kind = resolveEditReasonKind(filePath, getProv)
    addReason(getOrCreateCandidate(candidates, filePath), kind, 'Recently edited in the workspace', REASON_WEIGHTS.get(kind) ?? 32)
  }
}

function applyProvenanceDiffReasons(
  candidates: Map<string, MutableCandidate>,
  diffFiles: string[],
  repoFacts: RepoFacts,
  provenanceEnabled: boolean,
): void {
  const getProv = makeGetProv(provenanceEnabled)
  for (const filePath of diffFiles) {
    const weight = isDiffAgentAuthored(filePath, repoFacts, getProv) ? AGENT_DIFF_WEIGHT : (REASON_WEIGHTS.get('git_diff') ?? 56)
    addReason(getOrCreateCandidate(candidates, filePath), 'git_diff', 'Present in the current git diff', weight)
  }
}

interface RepoCandidateOpts {
  candidates: Map<string, MutableCandidate>; addCandidate: (filePath: string, kind: ContextReasonKind, detail: string) => void
  repoFacts: RepoFacts; workspaceRoots: string[]; provenanceEnabled: boolean
}

async function addRepoFactCandidates(opts: RepoCandidateOpts): Promise<{ recentEdits: string[]; diffFiles: string[]; diagnosticFiles: string[] }> {
  const { candidates, addCandidate, repoFacts, workspaceRoots, provenanceEnabled } = opts
  const [recentEdits, diffFiles, diagnosticFiles] = await Promise.all([
    resolveRecentEdits(repoFacts, workspaceRoots),
    resolveDiffFiles(repoFacts, workspaceRoots),
    resolveDiagnosticFiles(repoFacts, workspaceRoots),
  ])
  applyProvenanceEditReasons(candidates, recentEdits, provenanceEnabled)
  applyProvenanceDiffReasons(candidates, diffFiles, repoFacts, provenanceEnabled)
  for (const file of repoFacts.diagnostics.files) {
    addCandidate(await resolveWorkspaceFile(file.filePath, workspaceRoots), 'diagnostic', `Diagnostics: ${file.errors} errors, ${file.warnings} warnings`)
  }
  for (const root of repoFacts.roots) {
    for (const ep of root.entryPoints) {
      addCandidate(await resolveWorkspaceFile(ep, workspaceRoots, root.rootPath), 'dependency', `Workspace entry point for ${path.basename(root.rootPath)}`)
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

function applyImportAdjacency(candidates: Map<string, MutableCandidate>, snapshots: Map<string, ContextFileSnapshot>, seedFiles: string[]): void {
  const iaWeight = REASON_WEIGHTS.get('import_adjacency') ?? 22
  for (const candidate of candidates.values()) {
    const related = findRelatedSeeds(candidate, snapshots, seedFiles)
    if (related.length > 0) addReason(candidate, 'import_adjacency', `Import-adjacent to ${related.join(', ')}`, iaWeight + related.length - 1)
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true } catch { return false }
}

async function addTestCompanions(
  candidates: Map<string, MutableCandidate>,
  addCandidate: (filePath: string, kind: ContextReasonKind, detail: string) => void,
): Promise<void> {
  const paths = Array.from(candidates.keys()).map((k) => candidates.get(k)!.filePath)
  for (const p of paths) {
    const norm = path.normalize(p)
    const ext = path.extname(norm)
    const base = path.basename(norm, ext)
    if (base.endsWith('.test') || base.endsWith('.spec')) continue
    const dir = path.dirname(norm)
    const patterns = [
      path.join(dir, `${base}.test${ext}`), path.join(dir, `${base}.spec${ext}`),
      path.join(dir, '__tests__', `${base}${ext}`), path.join(dir, '__tests__', `${base}.test${ext}`),
    ]
    for (const tp of patterns) {
      if (await fileExists(tp)) addCandidate(tp, 'test_companion', `Test file for ${base}${ext}`)
    }
  }
}

// ─── PageRank ────────────────────────────────────────────────────────────────

function buildPageRankSeeds(
  selection: NormalizedSelection,
  candidates: Map<string, MutableCandidate>,
  provenanceEnabled: boolean,
): Array<{ id: string; weight: number }> {
  const cfg = store.get('context')
  const sw = cfg?.pagerankSeeds ?? { pinned: 0.5, symbol: 0.3, user_edit: 0.2 }
  const getProv = makeGetProv(provenanceEnabled)
  const seeds: Array<{ id: string; weight: number }> = []
  for (const f of selection.pinnedFiles) seeds.push({ id: f, weight: sw.pinned })
  for (const c of candidates.values()) {
    if (c.reasons.some((r) => r.kind === 'keyword_match')) seeds.push({ id: c.filePath, weight: sw.symbol })
    if (isRecentUserEdit(c.filePath, getProv)) seeds.push({ id: c.filePath, weight: sw.user_edit })
  }
  return seeds
}

function tryApplyPageRank(
  candidates: Map<string, MutableCandidate>,
  selection: NormalizedSelection,
  workspaceRoots: string[],
  provenanceEnabled: boolean,
): void {
  const gc = getGraphController()
  if (!gc) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- access internal db from compat shim
    const db = (gc as any)._db ?? (gc as any).db
    if (!db) return
    const seeds = buildPageRankSeeds(selection, candidates, provenanceEnabled)
    const project = workspaceRoots[0] ?? ''
    const prResult = computePageRank(db, { project, seeds, graphVersion: String(Date.now()) })
    const normalized = normalizePageRankScores(prResult.scores)
    for (const [filePath, score] of normalized) {
      if (score <= 0) continue
      const weight = Math.round(score * PAGERANK_SCALE)
      const candidate = getOrCreateCandidate(candidates, filePath)
      candidate.pagerank_score = score
      if (weight > 0) addReason(candidate, 'pagerank', `PageRank score: ${score.toFixed(3)}`, weight)
    }
  } catch {
    // PageRank is best-effort — never fail context selection
  }
}

interface BuildResultOpts {
  selection: NormalizedSelection; liveIdeState: LiveIdeState; recentEdits: string[]; diffFiles: string[]
  diagnosticFiles: string[]; keywords: string[]; candidates: Map<string, MutableCandidate>
  omittedCandidates: OmittedContextCandidate[]; snapshots: Map<string, ContextFileSnapshot>; repoFacts: RepoFacts
  /** When provided, used instead of additive rankCandidates output. */
  rankedFilesOverride?: RankedContextFile[]
}

function buildResult(o: BuildResultOpts): ContextSelectionResult {
  const hunksMap = new Map<string, GitDiffHunk[]>()
  for (const file of o.repoFacts.gitDiff.changedFiles) {
    if (file.hunks?.length) hunksMap.set(toPathKey(file.filePath), file.hunks)
  }
  const rankedFiles = o.rankedFilesOverride ?? rankCandidates(o.candidates)
  for (const ranked of rankedFiles) { const h = hunksMap.get(toPathKey(ranked.filePath)); if (h) ranked.hunks = h }
  return {
    liveIdeState: o.liveIdeState,
    rankingInputs: {
      userSelectedFiles: o.selection.selectedFiles, pinnedFiles: o.selection.pinnedFiles,
      includedFiles: o.selection.includedFiles, excludedFiles: o.selection.excludedFiles,
      activeFile: o.liveIdeState.activeFile, openFiles: o.liveIdeState.openFiles,
      dirtyFiles: o.liveIdeState.dirtyFiles, recentEdits: o.recentEdits, diffFiles: o.diffFiles,
      diagnosticFiles: o.diagnosticFiles, keywordMatches: o.keywords,
    },
    rankedFiles,
    omittedCandidates: o.omittedCandidates,
    snapshots: Object.fromEntries(Array.from(o.snapshots.values()).map((s) => [toPathKey(s.filePath), s])),
  }
}

export async function selectContextFiles(options: {
  request: TaskRequest
  repoFacts: RepoFacts
  liveIdeState?: LiveIdeState
}): Promise<ContextSelectionResult> {
  const { request, repoFacts } = options
  const cfg = store.get('context')
  const provenanceEnabled = cfg?.provenanceWeights !== false
  const pagerankEnabled = cfg?.pagerank !== false
  const workspaceRoots = uniqueFiles(request.workspaceRoots.length > 0 ? request.workspaceRoots : repoFacts.workspaceRoots)
  const selection = await normalizeSelection(request, workspaceRoots)
  const excludedKeys = new Set(selection.excludedFiles.map(toPathKey))
  const omittedCandidates: OmittedContextCandidate[] = []
  const omittedKeys = new Set<string>()
  for (const fp of selection.excludedFiles) pushOmitted(omittedCandidates, omittedKeys, fp, 'Excluded by request')
  const snapshots = new Map<string, ContextFileSnapshot>(getPersistentSnapshotCache())
  const liveIdeState = options.liveIdeState ?? await collectLiveIdeState(workspaceRoots, selection.selectedFiles, snapshots)
  const candidates = new Map<string, MutableCandidate>()
  const addCandidate = addCandidateFactory(candidates, excludedKeys, omittedCandidates, omittedKeys)
  addBaseCandidates(addCandidate, selection, liveIdeState)
  const { recentEdits, diffFiles, diagnosticFiles } = await addRepoFactCandidates({ candidates, addCandidate, repoFacts, workspaceRoots, provenanceEnabled })
  await addTestCompanions(candidates, addCandidate)
  const keywords = extractKeywords(request.goal, STOP_WORDS)
  await applyKeywordReasons(candidates, snapshots, keywords)
  applyImportAdjacency(candidates, snapshots, buildSeedFiles(selection, liveIdeState, diffFiles, diagnosticFiles))
  if (pagerankEnabled) tryApplyPageRank(candidates, selection, workspaceRoots, provenanceEnabled)
  const baseOpts = { selection, liveIdeState, recentEdits, diffFiles, diagnosticFiles, keywords, candidates, omittedCandidates, snapshots, repoFacts }
  if (cfg?.learnedRanker === true) {
    return buildResult({ ...baseOpts, rankedFilesOverride: classifierRankCandidates(candidates, request) })
  }
  const additiveRanked = rankCandidates(candidates)
  runShadowMode(additiveRanked, candidates, request)
  return buildResult({ ...baseOpts, rankedFilesOverride: additiveRanked })
}
