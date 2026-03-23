import type {
  ContextConfidence,
  ContextReasonKind,
  ContextSnippetSource,
  GitDiffHunk,
  OrchestrationMode,
  OrchestrationProvider,
  RepoFacts,
  VerificationProfileName,
} from './typesDomain'

export interface EditorSelectionRange {
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
}

export interface DirtyBufferSnapshot {
  filePath: string
  language?: string
  content: string
  selection?: EditorSelectionRange
  updatedAt: number
}

export interface LiveIdeState {
  activeFile?: string
  selectedFiles: string[]
  openFiles: string[]
  dirtyFiles: string[]
  dirtyBuffers: DirtyBufferSnapshot[]
  selection?: EditorSelectionRange
  terminalSnapshots?: import('./typesDomain').TerminalSessionSnapshot[]
  collectedAt: number
}

export interface ContextSelectionReason {
  kind: ContextReasonKind
  weight: number
  detail: string
}

export interface ContextSnippetRange {
  startLine: number
  endLine: number
}

export interface ContextSnippet {
  range: ContextSnippetRange
  source: ContextSnippetSource
  label: string
  content?: string
}

export interface ContextTruncationNote {
  reason: 'budget' | 'deduped' | 'max_lines' | 'binary' | 'omitted'
  detail: string
}

export interface RankedContextFile {
  filePath: string
  score: number
  confidence: ContextConfidence
  reasons: ContextSelectionReason[]
  snippets: ContextSnippet[]
  truncationNotes: ContextTruncationNote[]
  hunks?: GitDiffHunk[]
}

export interface OmittedContextCandidate {
  filePath: string
  reason: string
}

export interface ContextBudgetSummary {
  estimatedBytes: number
  estimatedTokens: number
  byteLimit?: number
  tokenLimit?: number
  droppedContentNotes: string[]
}

export interface ContextPacketTaskMetadata {
  taskId: string
  goal: string
  mode: OrchestrationMode
  provider: OrchestrationProvider
  verificationProfile: VerificationProfileName
}

export interface RepoMapSummary {
  projectName: string
  languages: string[]
  frameworks: string[]
  moduleCount: number
  modules: Array<{
    id: string
    label: string
    rootPath: string
    fileCount: number
    exports: string[]
    recentlyChanged: boolean
  }>
}

export interface ModuleContextSummary {
  moduleId: string
  label: string
  rootPath: string
  description: string
  keyResponsibilities: string[]
  gotchas: string[]
  exports: string[]
  dependencies?: string[]
}

export interface ContextPacket {
  version: 1
  id: string
  createdAt: number
  task: ContextPacketTaskMetadata
  repoFacts: RepoFacts
  liveIdeState: LiveIdeState
  files: RankedContextFile[]
  omittedCandidates: OmittedContextCandidate[]
  budget: ContextBudgetSummary
  /** Compressed structural map of the codebase (from context layer). */
  repoMap?: RepoMapSummary
  /** AI-generated summaries for modules relevant to this task (from context layer). */
  moduleSummaries?: ModuleContextSummary[]
  /** Pre-formatted graph summary (hotspots + blast radius) to inject into the prompt. */
  graphSummary?: string
  /** Pre-formatted session memory block from prior sessions. */
  sessionMemories?: string
}
