import { store } from '../config';
import type { ContextScoringSettings } from '../configTypes';
import {
  collectLiveIdeState,
  type ContextFileSnapshot,
  getPersistentSnapshotCache,
  toPathKey,
  uniqueFiles,
} from './contextSelectionSupport';
import type { ContextSelectionResult } from './contextSelector';
import {
  addBaseCandidates,
  addCandidateFactory,
  buildSeedFiles,
  type MutableCandidate,
  normalizeSelection,
  pushOmitted,
  rankCandidates,
} from './contextSelectorHelpers';
import { classifierRankCandidates, runShadowMode } from './contextSelectorRanker';
import {
  EXPERIMENTAL_WEIGHTS,
  rankCandidatesVariant,
  TUNED_WEIGHTS,
} from './contextSelectorRankerVariant';
import { buildResult } from './contextSelectorResult';
import {
  addRepoFactCandidates,
  addTestCompanions,
  applyImportAdjacency,
  applyKeywordReasons,
  STOP_WORDS,
  tryApplyPageRank,
} from './contextSelectorScoring';
import type {
  ContextReasonKind,
  LiveIdeState,
  OmittedContextCandidate,
  RankedContextFile,
  RepoFacts,
  TaskRequest,
} from './types';

function getBaseReasonWeight(kind: ContextReasonKind): number {
  switch (kind) {
    case 'user_selected':
      return 100;
    case 'pinned':
      return 95;
    case 'included':
      return 85;
    case 'dirty_buffer':
      return 68;
    default:
      return 0;
  }
}

interface SelectionState {
  cfg: ContextScoringSettings | undefined;
  provenanceEnabled: boolean;
  pagerankEnabled: boolean;
  workspaceRoots: string[];
  selection: Awaited<ReturnType<typeof normalizeSelection>>;
  omittedCandidates: OmittedContextCandidate[];
  snapshots: Map<string, ContextFileSnapshot>;
  liveIdeState: LiveIdeState;
  candidates: Map<string, MutableCandidate>;
  addCandidate: (filePath: string, kind: ContextReasonKind, detail: string) => void;
}

interface BuildSelectionStateOptions {
  request: TaskRequest;
  repoFacts: RepoFacts;
  liveIdeState?: LiveIdeState;
}

async function resolveSelectionState(
  request: TaskRequest,
  repoFacts: RepoFacts,
): Promise<{
  cfg: ContextScoringSettings | undefined;
  provenanceEnabled: boolean;
  pagerankEnabled: boolean;
  workspaceRoots: string[];
  selection: Awaited<ReturnType<typeof normalizeSelection>>;
}> {
  const cfg = store.get('context');
  const provenanceEnabled = cfg?.provenanceWeights !== false;
  const pagerankEnabled = cfg?.pagerank !== false;
  const workspaceRoots = uniqueFiles(
    request.workspaceRoots.length > 0 ? request.workspaceRoots : repoFacts.workspaceRoots,
  );
  const selection = await normalizeSelection(request, workspaceRoots);
  return { cfg, provenanceEnabled, pagerankEnabled, workspaceRoots, selection };
}

function createSelectionArtifacts(): {
  omittedCandidates: OmittedContextCandidate[];
  omittedKeys: Set<string>;
  snapshots: Map<string, ContextFileSnapshot>;
} {
  return {
    omittedCandidates: [],
    omittedKeys: new Set<string>(),
    snapshots: new Map<string, ContextFileSnapshot>(getPersistentSnapshotCache()),
  };
}

async function resolveLiveIdeState(
  liveIdeState: LiveIdeState | undefined,
  workspaceRoots: string[],
  selectedFiles: string[],
  snapshots: Map<string, ContextFileSnapshot>,
): Promise<LiveIdeState> {
  return liveIdeState ?? collectLiveIdeState(workspaceRoots, selectedFiles, snapshots);
}

function extractKeywords(goal: string, stopWords: ReadonlySet<string>, limit = 12): string[] {
  const tokens: string[] = [];
  for (const raw of goal.split(/\s+/)) {
    const stripped = raw.replace(/^[^\w]+|[^\w]+$/g, '');
    if (!stripped) continue;
    for (const part of stripped.split(/[-_]+/)) {
      for (const sub of part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')) {
        tokens.push(sub.toLowerCase());
      }
    }
  }
  return [
    ...new Set(tokens.filter((t) => t.length >= 3 && !stopWords.has(t) && !/^\d+$/.test(t))),
  ].slice(0, limit);
}

function createSelectionStateResult(state: SelectionState): SelectionState {
  return state;
}

async function buildSelectionState(options: BuildSelectionStateOptions): Promise<SelectionState> {
  const { request, repoFacts, liveIdeState } = options;
  const { cfg, provenanceEnabled, pagerankEnabled, workspaceRoots, selection } =
    await resolveSelectionState(request, repoFacts);
  const { omittedCandidates, omittedKeys, snapshots } = createSelectionArtifacts();
  for (const fp of selection.excludedFiles)
    pushOmitted(omittedCandidates, omittedKeys, fp, 'Excluded by request');
  const resolvedLiveIdeState = await resolveLiveIdeState(
    liveIdeState,
    workspaceRoots,
    selection.selectedFiles,
    snapshots,
  );
  const candidates = new Map<string, MutableCandidate>();
  const addCandidate = addCandidateFactory({
    candidates,
    excludedKeys: new Set(selection.excludedFiles.map(toPathKey)),
    omittedCandidates,
    omittedKeys,
    getWeight: getBaseReasonWeight,
  });
  addBaseCandidates(addCandidate, selection, resolvedLiveIdeState);
  return createSelectionStateResult({
    cfg,
    provenanceEnabled,
    pagerankEnabled,
    workspaceRoots,
    selection,
    omittedCandidates,
    snapshots,
    liveIdeState: resolvedLiveIdeState,
    candidates,
    addCandidate,
  });
}

function resolveRankerMode(): 'current' | 'tuned' | 'experimental' {
  // Wave 53b Phase C — variant ranker selection. Default 'current'.
  const rankerCfg = store.get('contextRanker') as { mode?: string } | undefined;
  const mode = rankerCfg?.mode;
  if (mode === 'tuned' || mode === 'experimental') return mode;
  return 'current';
}

function finalizeRanking(
  cfg: ContextScoringSettings | undefined,
  candidates: Map<string, MutableCandidate>,
  request: TaskRequest,
): RankedContextFile[] {
  if (cfg?.learnedRanker === true) return classifierRankCandidates(candidates, request);
  const mode = resolveRankerMode();
  if (mode === 'tuned') return rankCandidatesVariant(candidates, TUNED_WEIGHTS);
  if (mode === 'experimental') return rankCandidatesVariant(candidates, EXPERIMENTAL_WEIGHTS);
  const additiveRanked = rankCandidates(candidates);
  runShadowMode(additiveRanked, candidates, request);
  return additiveRanked;
}

export async function selectContextFiles(options: {
  request: TaskRequest;
  repoFacts: RepoFacts;
  liveIdeState?: LiveIdeState;
}): Promise<ContextSelectionResult> {
  const state = await buildSelectionState(options);
  const { cfg, provenanceEnabled, pagerankEnabled, workspaceRoots, selection } = state;
  const { omittedCandidates, snapshots, liveIdeState, candidates, addCandidate } = state;
  const { request, repoFacts } = options;
  const { recentEdits, diffFiles, diagnosticFiles } = await addRepoFactCandidates({
    candidates,
    addCandidate,
    repoFacts,
    workspaceRoots,
    provenanceEnabled,
  });
  await addTestCompanions(candidates, addCandidate);
  const keywords = extractKeywords(request.goal, STOP_WORDS);
  await applyKeywordReasons(candidates, snapshots, keywords);
  applyImportAdjacency(
    candidates,
    snapshots,
    buildSeedFiles(selection, liveIdeState, diffFiles, diagnosticFiles),
  );
  if (pagerankEnabled) tryApplyPageRank(candidates, selection, workspaceRoots, provenanceEnabled);
  return buildResult({
    selection, liveIdeState, recentEdits, diffFiles, diagnosticFiles, keywords,
    candidates, omittedCandidates, snapshots, repoFacts,
    rankedFilesOverride: finalizeRanking(cfg, candidates, request),
  });
}
