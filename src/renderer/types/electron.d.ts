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

export interface ClaudeCliSettings {
  /** Permission mode: 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' */
  permissionMode: string
  /** Model override: '' means CLI default. e.g. 'sonnet', 'opus', 'haiku', or full model ID */
  model: string
  /** Effort level: '' | 'low' | 'medium' | 'high' | 'max' */
  effort: string
  /** Extra system prompt appended to default */
  appendSystemPrompt: string
  /** Verbose output */
  verbose: boolean
  /** Max budget in USD (0 = unlimited) */
  maxBudgetUsd: number
  /** Allowed tools (comma-separated, empty = all) */
  allowedTools: string
  /** Disallowed tools (comma-separated, empty = none) */
  disallowedTools: string
  /** Additional directories to allow tool access */
  addDirs: string[]
  /** Enable Claude in Chrome integration */
  chrome: boolean
  /** Use git worktree for sessions */
  worktree: boolean
  /** Dangerously skip all permission checks */
  dangerouslySkipPermissions: boolean
}

export interface AgentTemplate {
  id: string
  name: string
  icon?: string
  /** Supports {{projectRoot}}, {{projectName}}, {{openFile}}, {{openFileName}} */
  promptTemplate: string
  /** Optional per-template CLI overrides (merged with global settings) */
  cliOverrides?: Partial<ClaudeCliSettings>
}

export interface NotificationSettings {
  /** 'all' | 'errors-only' | 'none' */
  level: string
  /** Whether to notify even when the app is focused */
  alwaysNotify: boolean
}

export interface WorkspaceLayout {
  name: string
  panelSizes: PanelSizes
  /** Which panels are visible */
  visiblePanels: {
    leftSidebar: boolean
    rightSidebar: boolean
    terminal: boolean
  }
  /** Optional: which right sidebar tab is active */
  rightSidebarTab?: string
  /** Whether this is a built-in layout that cannot be deleted */
  builtIn?: boolean
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
  /** Claude CLI launch settings */
  claudeCliSettings: ClaudeCliSettings
  /** Desktop notification preferences for agent events */
  notifications: NotificationSettings
  /** Pre-configured Claude Code launch profiles */
  agentTemplates: AgentTemplate[]
  /** Saved workspace layouts (panel arrangements) */
  workspaceLayouts: WorkspaceLayout[]
  /** Name of the currently active workspace layout */
  activeLayoutName: string
  /** Global toggle for the extension system */
  extensionsEnabled: boolean
  /** Names of extensions that have been explicitly disabled */
  disabledExtensions: string[]
  /** Whether LSP integration is enabled */
  lspEnabled: boolean
  /** Custom language server commands keyed by language id */
  lspServers: Record<string, string>
}

// ─── Extension types ──────────────────────────────────────────────────────────

export interface ExtensionInfo {
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  status: 'active' | 'inactive' | 'error'
  permissions: string[]
  errorMessage?: string
}

export interface ExtensionListResult extends IpcResult {
  extensions?: ExtensionInfo[]
}

export interface ExtensionLogResult extends IpcResult {
  log?: string[]
}

export interface ExtensionsAPI {
  list: () => Promise<ExtensionListResult>
  enable: (name: string) => Promise<IpcResult>
  disable: (name: string) => Promise<IpcResult>
  install: (sourcePath: string) => Promise<IpcResult>
  uninstall: (name: string) => Promise<IpcResult>
  getLog: (name: string) => Promise<ExtensionLogResult>
  openFolder: () => Promise<IpcResult>
  /** Returns a cleanup function — fires when an extension sends a notification */
  onNotification: (callback: (data: { extensionName: string; message: string }) => void) => () => void
}

// ─── Multi-buffer types ──────────────────────────────────────────────────────

export interface BufferExcerpt {
  filePath: string
  startLine: number
  endLine: number
  label?: string
}

export interface MultiBufferConfig {
  name: string
  excerpts: BufferExcerpt[]
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
    options?: { cwd?: string; cols?: number; rows?: number; startupCommand?: string }
  ) => Promise<PtySpawnResult>
  /** Spawns a Claude Code session directly using stored claudeCliSettings — no shell prompt flicker. */
  spawnClaude: (
    id: string,
    options?: { cwd?: string; cols?: number; rows?: number; initialPrompt?: string; cliOverrides?: Partial<ClaudeCliSettings> }
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
  /** When true, show notification even if the app window is focused */
  force?: boolean
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

// ─── Diff review types (per-hunk accept/reject) ─────────────────────────────

export interface DiffHunk {
  /** Raw @@ header line, e.g. "@@ -10,7 +10,8 @@" */
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  /** All lines in the hunk including context, prefixed with +/-/space */
  lines: string[]
  /** Full patch text for this hunk (including diff header + ---/+++ + hunk) for git apply */
  rawPatch: string
}

export type DiffFileStatus = 'modified' | 'added' | 'deleted' | 'renamed'

export interface FileDiff {
  /** Absolute file path */
  filePath: string
  /** Path relative to project root */
  relativePath: string
  status: DiffFileStatus
  hunks: DiffHunk[]
  /** For renames: the old path */
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

export interface GitStatusDetailedResult extends IpcResult {
  staged?: Record<string, string>
  unstaged?: Record<string, string>
}

export interface GitAPI {
  isRepo: (root: string) => Promise<GitIsRepoResult>
  status: (root: string) => Promise<GitStatusResult>
  statusDetailed: (root: string) => Promise<GitStatusDetailedResult>
  branch: (root: string) => Promise<GitBranchResult>
  diff: (root: string, filePath: string) => Promise<GitDiffResult>
  blame: (root: string, filePath: string) => Promise<GitBlameResult>
  log: (root: string, filePath: string, offset?: number) => Promise<GitLogResult>
  show: (root: string, hash: string, filePath: string) => Promise<GitShowResult>
  branches: (root: string) => Promise<GitBranchesResult>
  checkout: (root: string, branch: string) => Promise<IpcResult>
  stage: (root: string, filePath: string) => Promise<IpcResult>
  unstage: (root: string, filePath: string) => Promise<IpcResult>
  /** Stage all changes */
  stageAll: (root: string) => Promise<IpcResult>
  /** Unstage all changes */
  unstageAll: (root: string) => Promise<IpcResult>
  /** Create a commit with the given message */
  commit: (root: string, message: string) => Promise<IpcResult>
  /** Discard changes to a file (checkout HEAD version or delete untracked) */
  discardFile: (root: string, filePath: string) => Promise<IpcResult>
  /** Record current HEAD hash as a snapshot reference point */
  snapshot: (root: string) => Promise<GitSnapshotResult>
  /** Get unified diff of all changes since a given commit hash, parsed into per-file hunks */
  diffReview: (root: string, commitHash: string) => Promise<GitDiffReviewResult>
  /** Get file content at a specific commit */
  fileAtCommit: (root: string, commitHash: string, filePath: string) => Promise<GitFileAtCommitResult>
  /** Apply a single hunk patch (accept a change) */
  applyHunk: (root: string, patchContent: string) => Promise<IpcResult>
  /** Reverse-apply a single hunk patch (reject a change, restoring original) */
  revertHunk: (root: string, patchContent: string) => Promise<IpcResult>
  /** Fully revert a file to its state at a given commit */
  revertFile: (root: string, commitHash: string, filePath: string) => Promise<IpcResult>
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

// ─── Cost history types ──────────────────────────────────────────────────────

export interface CostEntry {
  date: string
  sessionId: string
  taskLabel: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  timestamp: number
}

export interface CostHistoryResult extends IpcResult {
  entries?: CostEntry[]
}

export interface CostAPI {
  addEntry: (entry: CostEntry) => Promise<IpcResult>
  getHistory: () => Promise<CostHistoryResult>
  clearHistory: () => Promise<IpcResult>
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

// ─── LSP types ────────────────────────────────────────────────────────────────

export interface LspCompletionItem {
  label: string
  kind: string
  detail?: string
  insertText?: string
  documentation?: string
}

export interface LspLocation {
  filePath: string
  line: number
  character: number
}

export interface LspDiagnostic {
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  range: { startLine: number; startChar: number; endLine: number; endChar: number }
}

export type LspServerStatusType = 'starting' | 'running' | 'error' | 'stopped'

export interface LspServerStatus {
  root: string
  language: string
  status: LspServerStatusType
}

export interface LspCompletionResult extends IpcResult {
  items?: LspCompletionItem[]
}

export interface LspHoverResult extends IpcResult {
  contents?: string
}

export interface LspDefinitionResult extends IpcResult {
  location?: LspLocation
}

export interface LspDiagnosticsResult extends IpcResult {
  diagnostics?: LspDiagnostic[]
}

export interface LspStatusResult extends IpcResult {
  servers?: LspServerStatus[]
}

export interface LspAPI {
  start: (root: string, language: string) => Promise<IpcResult>
  stop: (root: string, language: string) => Promise<IpcResult>
  completion: (root: string, filePath: string, line: number, character: number) => Promise<LspCompletionResult>
  hover: (root: string, filePath: string, line: number, character: number) => Promise<LspHoverResult>
  definition: (root: string, filePath: string, line: number, character: number) => Promise<LspDefinitionResult>
  diagnostics: (root: string, filePath: string) => Promise<LspDiagnosticsResult>
  didOpen: (root: string, filePath: string, content: string) => Promise<void>
  didChange: (root: string, filePath: string, content: string) => Promise<void>
  didClose: (root: string, filePath: string) => Promise<void>
  getStatus: () => Promise<LspStatusResult>
  /** Returns a cleanup function — fires when diagnostics are published */
  onDiagnostics: (callback: (event: { filePath: string; diagnostics: LspDiagnostic[] }) => void) => () => void
  /** Returns a cleanup function — fires when server status changes */
  onStatusChange: (callback: (servers: LspServerStatus[]) => void) => () => void
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
  cost: CostAPI
  shellHistory: ShellHistoryAPI
  updater: UpdaterAPI
  crash: CrashAPI
  perf: PerfAPI
  symbol: SymbolAPI
  lsp: LspAPI
  window: WindowAPI
  extensions: ExtensionsAPI
}

// ─── Window API ──────────────────────────────────────────────────────────────

export interface WindowInfo {
  id: number
  projectRoot: string | null
}

export interface WindowListResult extends IpcResult {
  windows?: WindowInfo[]
}

export interface WindowNewResult extends IpcResult {
  windowId?: number
}

export interface WindowAPI {
  /** Create a new window, optionally opened to a project root */
  create: (projectRoot?: string) => Promise<WindowNewResult>
  /** List all open windows with their project roots */
  list: () => Promise<WindowListResult>
  /** Focus a specific window by its ID */
  focus: (windowId: number) => Promise<IpcResult>
  /** Close a specific window by its ID */
  close: (windowId: number) => Promise<IpcResult>
}

// Augment the global Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
