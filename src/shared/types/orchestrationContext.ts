/** Orchestration context packet types. */

import type {
  ContextConfidence,
  ContextReasonKind,
  ContextSnippetSource,
  GitDiffHunk,
  OrchestrationMode,
  OrchestrationProvider,
  TerminalSessionSnapshot,
  VerificationProfileName,
} from './orchestrationDomain';

export interface EditorSelectionRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface DirtyBufferSnapshot {
  filePath: string;
  language?: string;
  content: string;
  selection?: EditorSelectionRange;
  updatedAt: number;
}

export interface LiveIdeState {
  activeFile?: string;
  selectedFiles: string[];
  openFiles: string[];
  dirtyFiles: string[];
  dirtyBuffers: DirtyBufferSnapshot[];
  selection?: EditorSelectionRange;
  terminalSnapshots?: TerminalSessionSnapshot[];
  collectedAt: number;
}

export interface ContextSelectionReason {
  kind: ContextReasonKind;
  weight: number;
  detail: string;
}

export interface ContextSnippetRange {
  startLine: number;
  endLine: number;
}

export interface ContextSnippet {
  range: ContextSnippetRange;
  source: ContextSnippetSource;
  label: string;
  content?: string;
}

export interface ContextTruncationNote {
  reason: 'budget' | 'deduped' | 'max_lines' | 'binary' | 'omitted';
  detail: string;
}

export interface RankedContextFile {
  filePath: string;
  score: number;
  confidence: ContextConfidence;
  reasons: ContextSelectionReason[];
  snippets: ContextSnippet[];
  truncationNotes: ContextTruncationNote[];
  hunks?: GitDiffHunk[];
  /** Wave 19 PageRank score in [0, 1] (normalised). Null for files outside the graph. */
  pagerank_score: number | null;
}

export interface OmittedContextCandidate {
  filePath: string;
  reason: string;
}

export interface ContextBudgetSummary {
  estimatedBytes: number;
  estimatedTokens: number;
  byteLimit?: number;
  tokenLimit?: number;
  droppedContentNotes: string[];
  tierAllocation?: Record<string, number>;
}

export interface ContextPacketTaskMetadata {
  taskId: string;
  goal: string;
  mode: OrchestrationMode;
  provider: OrchestrationProvider;
  verificationProfile: VerificationProfileName;
}

export interface WorkspaceRootFact {
  rootPath: string;
  fileCount?: number;
  directoryCount?: number;
  languages: string[];
  entryPoints: string[];
  recentlyEditedFiles: string[];
  indexedAt: number;
}

export interface GitDiffFileSummary {
  filePath: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown';
  hunks?: GitDiffHunk[];
}

export interface GitDiffSummary {
  changedFiles: GitDiffFileSummary[];
  totalAdditions: number;
  totalDeletions: number;
  changedFileCount: number;
  comparedAgainst?: string;
  currentBranch?: string;
  generatedAt: number;
}

export interface DiagnosticMessage {
  severity: 'error' | 'warning' | 'info' | 'hint';
  line: number;
  character?: number;
  message: string;
  source?: string;
}

export interface DiagnosticsFileSummary {
  filePath: string;
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
  messages?: DiagnosticMessage[];
}

export interface DiagnosticsSummary {
  files: DiagnosticsFileSummary[];
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  totalHints: number;
  generatedAt: number;
}

export interface RecentEditsSummary {
  files: string[];
  generatedAt: number;
}

export interface RecentCommit {
  hash: string;
  message: string;
  authorDate: string;
}

export interface RepoFacts {
  workspaceRoots: string[];
  roots: WorkspaceRootFact[];
  gitDiff: GitDiffSummary;
  diagnostics: DiagnosticsSummary;
  recentEdits: RecentEditsSummary;
  recentCommits?: RecentCommit[];
}

export interface RepoMapSummary {
  projectName: string;
  languages: string[];
  frameworks: string[];
  moduleCount: number;
  modules: Array<{
    id: string;
    label: string;
    rootPath: string;
    fileCount: number;
    exports: string[];
    recentlyChanged: boolean;
  }>;
}

export interface ModuleContextSummary {
  moduleId: string;
  label: string;
  rootPath: string;
  description: string;
  keyResponsibilities: string[];
  gotchas: string[];
  exports: string[];
  dependencies?: string[];
}

export interface ContextPacket {
  version: 1;
  id: string;
  createdAt: number;
  task: ContextPacketTaskMetadata;
  repoFacts: RepoFacts;
  liveIdeState: LiveIdeState;
  files: RankedContextFile[];
  omittedCandidates: OmittedContextCandidate[];
  budget: ContextBudgetSummary;
  repoMap?: RepoMapSummary;
  moduleSummaries?: ModuleContextSummary[];
  graphSummary?: string;
  sessionMemories?: string;
  systemInstructions?: string;
  /** Expanded skill body — injected as hidden context alongside system instructions */
  skillInstructions?: string;
  /**
   * Wave 25 Phase D: rendered pinned context sections (one per non-dismissed pin).
   * Each section is `=== [Pin: <title>] ===\n<content>\n`. Injected before file
   * candidates so they are prefix-cacheable.
   */
  pinnedContext?: string;
}
