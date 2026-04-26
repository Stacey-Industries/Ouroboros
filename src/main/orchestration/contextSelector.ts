import type { ContextFileSnapshot, LiveIdeState } from './contextSelectionSupport'
import type { OmittedContextCandidate, RankedContextFile } from './types'

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

export { selectContextFiles } from './contextSelectorWorkflow'
