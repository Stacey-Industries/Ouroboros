import {
  type ContextFileSnapshot,
  toPathKey,
} from './contextSelectionSupport'
import type { ContextSelectionResult } from './contextSelector'
import {
  type MutableCandidate,
  type NormalizedSelection,
  rankCandidates,
} from './contextSelectorHelpers'
import type {
  GitDiffHunk,
  LiveIdeState,
  OmittedContextCandidate,
  RankedContextFile,
  RepoFacts,
} from './types'

export interface BuildResultOpts {
  selection: NormalizedSelection
  liveIdeState: LiveIdeState
  recentEdits: string[]
  diffFiles: string[]
  diagnosticFiles: string[]
  keywords: string[]
  candidates: Map<string, MutableCandidate>
  omittedCandidates: OmittedContextCandidate[]
  snapshots: Map<string, ContextFileSnapshot>
  repoFacts: RepoFacts
  rankedFilesOverride?: RankedContextFile[]
}

export function buildResult(o: BuildResultOpts): ContextSelectionResult {
  const hunksMap = new Map<string, GitDiffHunk[]>()
  for (const file of o.repoFacts.gitDiff.changedFiles) {
    if (file.hunks?.length) hunksMap.set(toPathKey(file.filePath), file.hunks)
  }
  const rankedFiles = o.rankedFilesOverride ?? rankCandidates(o.candidates)
  for (const ranked of rankedFiles) {
    const h = hunksMap.get(toPathKey(ranked.filePath))
    if (h) ranked.hunks = h
  }
  return {
    liveIdeState: o.liveIdeState,
    rankingInputs: {
      userSelectedFiles: o.selection.selectedFiles,
      pinnedFiles: o.selection.pinnedFiles,
      includedFiles: o.selection.includedFiles,
      excludedFiles: o.selection.excludedFiles,
      activeFile: o.liveIdeState.activeFile,
      openFiles: o.liveIdeState.openFiles,
      dirtyFiles: o.liveIdeState.dirtyFiles,
      recentEdits: o.recentEdits,
      diffFiles: o.diffFiles,
      diagnosticFiles: o.diagnosticFiles,
      keywordMatches: o.keywords,
    },
    rankedFiles,
    omittedCandidates: o.omittedCandidates,
    snapshots: Object.fromEntries(
      Array.from(o.snapshots.values()).map((s) => [toPathKey(s.filePath), s]),
    ),
  }
}
