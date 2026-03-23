import type {
  AppConfig,
  AppTheme,
  ClaudeCliSettings,
  CodexCliSettings,
  CodexModelOption,
  FileChangeEvent,
  HookPayload,
  IpcResult,
  ReadBinaryFileResult,
  ReadDirResult,
  ReadFileResult,
  SelectFolderResult
} from './electron-foundation'

export interface PtySpawnResult extends IpcResult {
  already?: boolean
}

export interface PtyCwdResult extends IpcResult {
  cwd?: string
}

export interface PtyStopRecordingResult extends IpcResult {
  filePath?: string
  cancelled?: boolean
}

export interface ActiveSessionInfo {
  id: string
  cwd: string
}

export interface PtyAPI {
  spawn: (
    id: string,
    options?: { cwd?: string; cols?: number; rows?: number; startupCommand?: string }
  ) => Promise<PtySpawnResult>
  spawnClaude: (
    id: string,
    options?: {
      cwd?: string
      cols?: number
      rows?: number
      initialPrompt?: string
      cliOverrides?: Partial<ClaudeCliSettings>
      resumeMode?: string
      /** Provider:model override (e.g. 'minimax:MiniMax-M2.7') */
      providerModel?: string
    }
  ) => Promise<PtySpawnResult>
  spawnCodex: (
    id: string,
    options?: {
      cwd?: string
      cols?: number
      rows?: number
      initialPrompt?: string
      cliOverrides?: Partial<CodexCliSettings>
      resumeThreadId?: string
    }
  ) => Promise<PtySpawnResult>
  write: (id: string, data: string) => Promise<IpcResult>
  resize: (id: string, cols: number, rows: number) => Promise<IpcResult>
  kill: (id: string) => Promise<IpcResult>
  getCwd: (id: string) => Promise<PtyCwdResult>
  listSessions: () => Promise<ActiveSessionInfo[]>
  startRecording: (id: string) => Promise<IpcResult>
  stopRecording: (id: string) => Promise<PtyStopRecordingResult>
  onData: (id: string, callback: (data: string) => void) => () => void
  onExit: (
    id: string,
    callback: (result: { exitCode: number | null; signal: number | null }) => void
  ) => () => void
  onRecordingState: (id: string, callback: (state: { recording: boolean }) => void) => () => void
}

export interface CodexAPI {
  listModels: () => Promise<CodexModelOption[]>
}

export interface ConfigExportResult extends IpcResult {
  filePath?: string
  cancelled?: boolean
}

export interface ConfigImportResult extends IpcResult {
  config?: AppConfig
  cancelled?: boolean
}

export interface ConfigOpenFileResult extends IpcResult {
  filePath?: string
}

export interface ConfigAPI {
  getAll: () => Promise<AppConfig>
  get: <K extends keyof AppConfig>(key: K) => Promise<AppConfig[K]>
  set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<IpcResult>
  export: () => Promise<ConfigExportResult>
  import: () => Promise<ConfigImportResult>
  openSettingsFile: () => Promise<ConfigOpenFileResult>
  onExternalChange: (callback: (config: AppConfig) => void) => () => void
}

export interface ShowImageDialogResult extends IpcResult {
  cancelled?: boolean
  attachments?: import('../../main/agentChat/types').ImageAttachment[]
}

export interface FilesAPI {
  writeFile: (filePath: string, data: Uint8Array) => Promise<IpcResult>
  saveFile: (filePath: string, content: string) => Promise<IpcResult>
  readFile: (filePath: string) => Promise<ReadFileResult>
  readBinaryFile: (filePath: string) => Promise<ReadBinaryFileResult>
  readDir: (dirPath: string) => Promise<ReadDirResult>
  watchDir: (dirPath: string) => Promise<IpcResult>
  unwatchDir: (dirPath: string) => Promise<IpcResult>
  selectFolder: () => Promise<SelectFolderResult>
  createFile: (filePath: string, content?: string) => Promise<IpcResult>
  mkdir: (dirPath: string) => Promise<IpcResult>
  rename: (oldPath: string, newPath: string) => Promise<IpcResult>
  copyFile: (sourcePath: string, destPath: string) => Promise<IpcResult>
  delete: (targetPath: string) => Promise<IpcResult>
  softDelete: (targetPath: string) => Promise<IpcResult & { tempPath?: string }>
  restoreDeleted: (tempPath: string, originalPath: string) => Promise<IpcResult>
  showImageDialog: () => Promise<ShowImageDialogResult>
  onFileChange: (callback: (change: FileChangeEvent) => void) => () => void
}

export interface HooksAPI {
  onAgentEvent: (callback: (event: HookPayload) => void) => () => void
  onToolCall: (callback: (event: HookPayload) => void) => () => void
}

export interface ApprovalRequest {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  sessionId: string
  timestamp: number
}

export interface ApprovalResolved {
  requestId: string
  decision: 'approve' | 'reject'
}

export interface ApprovalAPI {
  respond: (requestId: string, decision: 'approve' | 'reject', reason?: string) => Promise<IpcResult>
  alwaysAllow: (sessionId: string, toolName: string) => Promise<IpcResult>
  onRequest: (callback: (request: ApprovalRequest) => void) => () => void
  onResolved: (callback: (resolved: ApprovalResolved) => void) => () => void
}

export type MenuEvent = 'menu:open-folder' | 'menu:new-terminal' | 'menu:command-palette' | 'menu:settings'

export interface NotifyOptions {
  title: string
  body: string
  icon?: string
  force?: boolean
}

export interface NotifyResult extends IpcResult {
  skipped?: boolean
}

export interface AppAPI {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  openExternal: (url: string) => Promise<IpcResult>
  setTitleBarOverlay: (color: string, symbolColor: string) => Promise<IpcResult>
  notify: (options: NotifyOptions) => Promise<NotifyResult>
  rebuildAndRestart: () => Promise<IpcResult>
  rebuildWeb: () => Promise<IpcResult>
  onMenuEvent: (callback: (event: MenuEvent) => void) => () => void
  /** Custom window controls (frame: false on Windows) */
  minimizeWindow: () => Promise<IpcResult>
  toggleMaximizeWindow: () => Promise<IpcResult>
  closeWindow: () => Promise<IpcResult>

  /** Window and app actions */
  newWindow: () => Promise<IpcResult>
  toggleFullscreen: () => Promise<IpcResult>
  toggleDevTools: () => Promise<IpcResult>
  openLogsFolder: () => Promise<IpcResult>
  zoomIn: () => Promise<IpcResult>
  zoomOut: () => Promise<IpcResult>
  zoomReset: () => Promise<IpcResult>
}

export interface ShellAPI {
  showItemInFolder: (fullPath: string) => Promise<IpcResult>
  openExtensionsFolder: () => Promise<IpcResult>
}

export interface ThemeAPI {
  get: () => Promise<AppTheme>
  set: (theme: AppTheme) => Promise<IpcResult>
  onChange: (callback: (theme: AppTheme) => void) => () => void
}
