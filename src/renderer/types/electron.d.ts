/**
 * electron.d.ts — Type declarations for the contextBridge API exposed by preload.ts.
 *
 * These types are used in the renderer process to get full type-safety
 * when calling window.electronAPI.
 */

export type AppTheme = 'retro' | 'modern' | 'warp' | 'cursor' | 'kiro' | 'custom'

export interface PanelSizes {
  leftSidebar: number
  rightSidebar: number
  terminal: number
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

export interface AppConfig {
  recentProjects: string[]
  defaultProjectRoot: string
  activeTheme: AppTheme
  hooksServerPort: number
  terminalFontSize: number
  autoInstallHooks: boolean
  shell: string
  panelSizes: PanelSizes
  windowBounds: WindowBounds
  fontUI: string
  fontMono: string
  fontSizeUI: number
  keybindings: Record<string, string>
  showBgGradient: boolean
  customThemeColors: Record<string, string>
  terminalSessions: Array<{ cwd: string; title: string }>
  customCSS: string
  /** Absolute paths pinned to the top of the file tree */
  bookmarks: string[]
  /** Extra ignore patterns merged with the hardcoded list */
  fileTreeIgnorePatterns: string[]
  /**
   * Named profiles — each value is a partial config snapshot that can be applied
   * over the current config to switch between saved setups.
   */
  profiles: Record<string, Partial<Omit<AppConfig, 'profiles'>>>
  /** All open project roots for multi-root workspace support */
  multiRoots: string[]
  /** Empty string = use shell default PS1 */
  customPrompt: string
  /** 'default' | 'minimal' | 'powerline' | 'git' | 'custom' */
  promptPreset: string
}

// ─── File system types ───────────────────────────────────────────────────────

export type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

export interface FileChangeEvent {
  type: FileChangeType
  path: string
}

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
}

// ─── Agent / hooks types ─────────────────────────────────────────────────────

export type AgentEventType = 'tool_call' | 'tool_result' | 'message' | 'error' | 'status'

export interface AgentEvent {
  type: AgentEventType
  sessionId?: string
  agentId?: string
  timestamp: number
  payload: unknown
}

export interface ToolCallPayload {
  tool: string
  input: Record<string, unknown>
  callId: string
}

export interface ToolCallEvent extends AgentEvent {
  type: 'tool_call'
  payload: ToolCallPayload
}

// ─── IPC result types ────────────────────────────────────────────────────────

export interface IpcResult {
  success: boolean
  error?: string
}

export interface ReadFileResult extends IpcResult {
  content?: string
}

export interface ReadDirResult extends IpcResult {
  items?: DirEntry[]
}

export interface SelectFolderResult extends IpcResult {
  cancelled?: boolean
  path?: string | null
}

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

// ─── PTY API ─────────────────────────────────────────────────────────────────

export interface ActiveSessionInfo {
  id: string
  cwd: string
}

export interface PtyAPI {
  spawn: (
    id: string,
    options?: { cwd?: string; cols?: number; rows?: number }
  ) => Promise<PtySpawnResult>
  write: (id: string, data: string) => Promise<IpcResult>
  resize: (id: string, cols: number, rows: number) => Promise<IpcResult>
  kill: (id: string) => Promise<IpcResult>
  getCwd: (id: string) => Promise<PtyCwdResult>
  listSessions: () => Promise<ActiveSessionInfo[]>
  startRecording: (id: string) => Promise<IpcResult>
  stopRecording: (id: string) => Promise<PtyStopRecordingResult>
  /** Returns a cleanup function */
  onData: (id: string, callback: (data: string) => void) => () => void
  /** Returns a cleanup function */
  onExit: (
    id: string,
    callback: (result: { exitCode: number | null; signal: number | null }) => void
  ) => () => void
  /** Returns a cleanup function — fires when recording state changes for a session */
  onRecordingState: (
    id: string,
    callback: (state: { recording: boolean }) => void
  ) => () => void
}

// ─── Config API ──────────────────────────────────────────────────────────────

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
  /** Returns a cleanup function — fires when settings.json is changed externally */
  onExternalChange: (callback: (config: AppConfig) => void) => () => void
}

// ─── Files API ───────────────────────────────────────────────────────────────

export interface FilesAPI {
  /** Write raw content to a file (used for drag-and-drop from OS) */
  writeFile: (filePath: string, data: Uint8Array) => Promise<IpcResult>
  readFile: (filePath: string) => Promise<ReadFileResult>
  readDir: (dirPath: string) => Promise<ReadDirResult>
  watchDir: (dirPath: string) => Promise<IpcResult>
  unwatchDir: (dirPath: string) => Promise<IpcResult>
  selectFolder: () => Promise<SelectFolderResult>
  /** Create a new file with optional content (defaults to empty) */
  createFile: (filePath: string, content?: string) => Promise<IpcResult>
  /** Create a new directory */
  mkdir: (dirPath: string) => Promise<IpcResult>
  /** Rename or move a file/directory */
  rename: (oldPath: string, newPath: string) => Promise<IpcResult>
  /** Copy a single file from sourcePath to destPath */
  copyFile: (sourcePath: string, destPath: string) => Promise<IpcResult>
  /** Delete a file/directory (moves to trash) */
  delete: (targetPath: string) => Promise<IpcResult>
  /** Returns a cleanup function */
  onFileChange: (callback: (change: FileChangeEvent) => void) => () => void
}

// ─── Hooks API ───────────────────────────────────────────────────────────────

export interface HooksAPI {
  /** Returns a cleanup function */
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  /** Returns a cleanup function — only fires for tool_call events */
  onToolCall: (callback: (event: AgentEvent) => void) => () => void
}

// ─── App API ─────────────────────────────────────────────────────────────────

export type MenuEvent = 'menu:open-folder' | 'menu:new-terminal' | 'menu:command-palette' | 'menu:settings'

export interface NotifyOptions {
  title: string
  body: string
  icon?: string
}

export interface NotifyResult extends IpcResult {
  skipped?: boolean
}

export interface AppAPI {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  openExternal: (url: string) => Promise<IpcResult>
  /** Update the native titlebar overlay colors (Windows only) */
  setTitleBarOverlay: (color: string, symbolColor: string) => Promise<IpcResult>
  /** Show a desktop notification (only fires when the app window is not focused) */
  notify: (options: NotifyOptions) => Promise<NotifyResult>
  /** Returns a cleanup function */
  onMenuEvent: (callback: (event: MenuEvent) => void) => () => void
}

// ─── Shell API ───────────────────────────────────────────────────────────

export interface ShellAPI {
  showItemInFolder: (fullPath: string) => Promise<IpcResult>
  openExtensionsFolder: () => Promise<IpcResult>
}

// ─── Theme API ───────────────────────────────────────────────────────────────

export interface ThemeAPI {
  get: () => Promise<AppTheme>
  set: (theme: AppTheme) => Promise<IpcResult>
  /** Returns a cleanup function */
  onChange: (callback: (theme: AppTheme) => void) => () => void
}

// ─── Git API ─────────────────────────────────────────────────────────────────

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

// ─── Git diff types ──────────────────────────────────────────────────────────

export type DiffLineKind = 'added' | 'modified' | 'deleted'

export interface DiffLineInfo {
  line: number
  kind: DiffLineKind
}

export interface GitDiffResult extends IpcResult {
  lines?: DiffLineInfo[]
}

// ─── Git blame types ─────────────────────────────────────────────────────────

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

// ─── Git log types ───────────────────────────────────────────────────────────

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

// ─── Git branches / checkout types ───────────────────────────────────────────

export interface GitBranchesResult extends IpcResult {
  branches?: string[]
}

export interface GitAPI {
  isRepo: (root: string) => Promise<GitIsRepoResult>
  status: (root: string) => Promise<GitStatusResult>
  branch: (root: string) => Promise<GitBranchResult>
  diff: (root: string, filePath: string) => Promise<GitDiffResult>
  blame: (root: string, filePath: string) => Promise<GitBlameResult>
  log: (root: string, filePath: string, offset?: number) => Promise<GitLogResult>
  show: (root: string, hash: string, filePath: string) => Promise<GitShowResult>
  branches: (root: string) => Promise<GitBranchesResult>
  checkout: (root: string, branch: string) => Promise<IpcResult>
  stage: (root: string, filePath: string) => Promise<IpcResult>
  unstage: (root: string, filePath: string) => Promise<IpcResult>
}

// ─── Shell history API ───────────────────────────────────────────────────────

export interface ShellHistoryResult extends IpcResult {
  commands?: string[]
}

export interface ShellHistoryAPI {
  /** Read recent commands from ~/.bash_history or ~/.zsh_history */
  read: () => Promise<ShellHistoryResult>
}

// ─── Updater types ───────────────────────────────────────────────────────────

export type UpdaterEventType =
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

export interface UpdaterEvent {
  type: UpdaterEventType
  /** Present for update-available / update-not-available / update-downloaded */
  info?: unknown
  /** Present for download-progress */
  progress?: {
    bytesPerSecond: number
    percent: number
    transferred: number
    total: number
  }
  /** Present for error */
  error?: string
}

export interface UpdaterAPI {
  check: () => Promise<IpcResult>
  install: () => Promise<IpcResult>
  /** Returns a cleanup function */
  onUpdateEvent: (callback: (event: UpdaterEvent) => void) => () => void
}

// ─── Crash reporting types ────────────────────────────────────────────────────

export interface CrashLog {
  name: string
  content: string
  mtime: number
}

export interface CrashLogsResult extends IpcResult {
  logs?: CrashLog[]
}

export interface CrashAPI {
  getCrashLogs: () => Promise<CrashLogsResult>
  clearCrashLogs: () => Promise<IpcResult>
  openCrashLogDir: () => Promise<IpcResult>
  logError: (source: string, message: string, stack?: string) => Promise<IpcResult>
}

// ─── Performance monitoring types ────────────────────────────────────────────

export interface MemoryUsage {
  heapUsed: number
  heapTotal: number
  rss: number
  external: number
}

export interface ProcessMetrics {
  pid: number
  type: string
  cpu: { percentCPUUsage: number; idleWakeupsPerSecond: number }
  memory: { workingSetSize: number; peakWorkingSetSize: number }
}

export interface PerfMetrics {
  timestamp: number
  memory: MemoryUsage
  processes: ProcessMetrics[]
}

export interface PerfPingResult extends IpcResult {
  ts?: number
}

export interface PerfAPI {
  ping: () => Promise<PerfPingResult>
  /** Returns a cleanup function */
  onMetrics: (callback: (metrics: PerfMetrics) => void) => () => void
}

// ─── Sessions API ────────────────────────────────────────────────────────────

export interface SaveSessionResult extends IpcResult {
  filePath?: string
}

export interface LoadSessionsResult extends IpcResult {
  sessions?: unknown[]
}

export interface ExportSessionResult extends IpcResult {
  filePath?: string
  cancelled?: boolean
}

export interface SessionsAPI {
  save: (session: unknown) => Promise<SaveSessionResult>
  load: () => Promise<LoadSessionsResult>
  delete: (sessionId: string) => Promise<IpcResult>
  export: (session: unknown, format: 'json' | 'markdown') => Promise<ExportSessionResult>
}

// ─── Symbol search types ─────────────────────────────────────────────────────

export interface SymbolEntry {
  name: string
  /** 'function' | 'class' | 'interface' | 'type' | 'const' | 'def' | 'fn' */
  type: string
  filePath: string
  relativePath: string
  line: number
}

export interface SymbolSearchResult extends IpcResult {
  symbols?: SymbolEntry[]
}

export interface SymbolAPI {
  search: (root: string) => Promise<SymbolSearchResult>
}

// ─── Root API ────────────────────────────────────────────────────────────────

export interface ElectronAPI {
  pty: PtyAPI
  config: ConfigAPI
  files: FilesAPI
  hooks: HooksAPI
  app: AppAPI
  shell: ShellAPI
  theme: ThemeAPI
  git: GitAPI
  sessions: SessionsAPI
  shellHistory: ShellHistoryAPI
  updater: UpdaterAPI
  crash: CrashAPI
  perf: PerfAPI
  symbol: SymbolAPI
}

// Augment the global Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
