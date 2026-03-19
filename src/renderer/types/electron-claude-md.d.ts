import type { IpcResult } from './electron-foundation'

export type ClaudeMdTriggerMode = 'post-session' | 'post-commit' | 'manual'
export type ClaudeMdModel = 'haiku' | 'sonnet' | 'opus'

export interface ClaudeMdSettings {
  enabled: boolean
  triggerMode: ClaudeMdTriggerMode
  model: ClaudeMdModel
  autoCommit: boolean
  generateRoot: boolean
  generateSubdirs: boolean
  excludeDirs: string[]
}

export interface ClaudeMdGenerationResult {
  dirPath: string
  filePath: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
}

export interface ClaudeMdGenerationStatus {
  running: boolean
  currentDir?: string
  progress?: { completed: number; total: number }
  lastRun?: { timestamp: number; results: ClaudeMdGenerationResult[] }
}

export interface ClaudeMdGenerateResult extends IpcResult {
  results?: ClaudeMdGenerationResult[]
}

export interface ClaudeMdGenerateDirResult extends IpcResult {
  result?: ClaudeMdGenerationResult
}

export interface ClaudeMdStatusResult extends IpcResult {
  status?: ClaudeMdGenerationStatus
}

export interface ClaudeMdAPI {
  generate: (projectRoot: string, options?: { fullSweep?: boolean }) => Promise<ClaudeMdGenerateResult>
  generateForDir: (projectRoot: string, dirPath: string) => Promise<ClaudeMdGenerateDirResult>
  getStatus: () => Promise<ClaudeMdStatusResult>
  onStatusChange: (callback: (status: ClaudeMdGenerationStatus) => void) => () => void
}
