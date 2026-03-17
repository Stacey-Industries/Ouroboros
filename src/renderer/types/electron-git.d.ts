import type { IpcResult } from './electron-foundation'

export type GitFileStatus = 'M' | 'A' | 'D' | '?' | 'R'

export interface GitIsRepoResult extends IpcResult {
  isRepo?: boolean
}

export interface GitStatusResult extends IpcResult {
  files?: Record<string, string>
}

export interface GitBranchResult extends IpcResult {
  branch?: string
}

export type DiffLineKind = 'added' | 'modified' | 'deleted'

export interface DiffLineInfo {
  line: number
  kind: DiffLineKind
}

export interface GitDiffResult extends IpcResult {
  lines?: DiffLineInfo[]
}

export interface DiffHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
  rawPatch: string
}

export type DiffFileStatus = 'modified' | 'added' | 'deleted' | 'renamed'

export interface FileDiff {
  filePath: string
  relativePath: string
  status: DiffFileStatus
  hunks: DiffHunk[]
  oldPath?: string
}

export interface GitSnapshotResult extends IpcResult {
  commitHash?: string
}

export interface GitDiffReviewResult extends IpcResult {
  files?: FileDiff[]
}

export interface GitFileAtCommitResult extends IpcResult {
  content?: string
}

export interface BlameLine {
  hash: string
  author: string
  date: number
  summary: string
  line: number
}

export interface GitBlameResult extends IpcResult {
  lines?: BlameLine[]
}

export interface CommitEntry {
  hash: string
  author: string
  email: string
  date: string
  message: string
}

export interface GitLogResult extends IpcResult {
  commits?: CommitEntry[]
}

export interface GitShowResult extends IpcResult {
  patch?: string
}

export interface GitDiffRawResult extends IpcResult {
  patch?: string
}

export interface GitBranchesResult extends IpcResult {
  branches?: string[]
}

export interface GitStatusDetailedResult extends IpcResult {
  staged?: Record<string, string>
  unstaged?: Record<string, string>
}

export interface GitChangedFilesResult extends IpcResult {
  files?: Array<{ path: string; status: string; additions: number; deletions: number }>
}

export interface GitStashResult extends IpcResult {
  stashRef?: string
  dirtyCount?: number
  branch?: string
  previousBranch?: string
}

export interface GitAPI {
  isRepo: (root: string) => Promise<GitIsRepoResult>
  status: (root: string) => Promise<GitStatusResult>
  statusDetailed: (root: string) => Promise<GitStatusDetailedResult>
  branch: (root: string) => Promise<GitBranchResult>
  diff: (root: string, filePath: string) => Promise<GitDiffResult>
  diffRaw: (root: string, filePath: string) => Promise<GitDiffRawResult>
  blame: (root: string, filePath: string) => Promise<GitBlameResult>
  log: (root: string, filePath: string, offset?: number) => Promise<GitLogResult>
  show: (root: string, hash: string, filePath: string) => Promise<GitShowResult>
  branches: (root: string) => Promise<GitBranchesResult>
  checkout: (root: string, branch: string) => Promise<IpcResult>
  stage: (root: string, filePath: string) => Promise<IpcResult>
  unstage: (root: string, filePath: string) => Promise<IpcResult>
  stageAll: (root: string) => Promise<IpcResult>
  unstageAll: (root: string) => Promise<IpcResult>
  commit: (root: string, message: string) => Promise<IpcResult>
  discardFile: (root: string, filePath: string) => Promise<IpcResult>
  snapshot: (root: string) => Promise<GitSnapshotResult>
  diffReview: (root: string, commitHash: string) => Promise<GitDiffReviewResult>
  fileAtCommit: (root: string, commitHash: string, filePath: string) => Promise<GitFileAtCommitResult>
  applyHunk: (root: string, patchContent: string) => Promise<IpcResult>
  revertHunk: (root: string, patchContent: string) => Promise<IpcResult>
  revertFile: (root: string, commitHash: string, filePath: string) => Promise<IpcResult>
  diffBetween: (root: string, fromHash: string, toHash: string) => Promise<GitDiffReviewResult>
  changedFilesBetween: (root: string, fromHash: string, toHash: string) => Promise<GitChangedFilesResult>
  restoreSnapshot: (root: string, commitHash: string) => Promise<GitStashResult>
  createSnapshot: (root: string, label?: string) => Promise<GitSnapshotResult>
  dirtyCount: (root: string) => Promise<{ success: boolean; count: number; error?: string }>
}

export interface ShellHistoryResult extends IpcResult {
  commands?: string[]
}

export interface ShellHistoryAPI {
  read: () => Promise<ShellHistoryResult>
}

export type UpdaterEventType =
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

export interface UpdaterEvent {
  type: UpdaterEventType
  info?: unknown
  progress?: {
    bytesPerSecond: number
    percent: number
    transferred: number
    total: number
  }
  error?: string
}

export interface UpdaterAPI {
  check: () => Promise<IpcResult>
  download: () => Promise<IpcResult>
  install: () => Promise<IpcResult>
  onUpdateEvent: (callback: (event: UpdaterEvent) => void) => () => void
}
