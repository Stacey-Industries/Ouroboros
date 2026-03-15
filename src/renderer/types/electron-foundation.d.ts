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
  permissionMode: string
  model: string
  effort: string
  appendSystemPrompt: string
  verbose: boolean
  maxBudgetUsd: number
  allowedTools: string
  disallowedTools: string
  addDirs: string[]
  chrome: boolean
  worktree: boolean
  dangerouslySkipPermissions: boolean
}

export interface AgentTemplate {
  id: string
  name: string
  icon?: string
  promptTemplate: string
  cliOverrides?: Partial<ClaudeCliSettings>
}

export interface NotificationSettings {
  level: string
  alwaysNotify: boolean
}

export interface WorkspaceLayout {
  name: string
  panelSizes: PanelSizes
  visiblePanels: {
    leftSidebar: boolean
    rightSidebar: boolean
    terminal: boolean
  }
  rightSidebarTab?: string
  builtIn?: boolean
}

export interface WorkspaceSnapshot {
  id: string
  commitHash: string
  sessionId: string
  sessionLabel?: string
  timestamp: number
  type: 'session-start' | 'session-end' | 'manual'
  fileCount?: number
  projectRoot?: string
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
  terminalSessions: Array<{ cwd: string; title: string; isClaude?: boolean; claudeSessionId?: string }>
  customCSS: string
  bookmarks: string[]
  fileTreeIgnorePatterns: string[]
  profiles: Record<string, Partial<Omit<AppConfig, 'profiles'>>>
  multiRoots: string[]
  customPrompt: string
  promptPreset: string
  claudeCliSettings: ClaudeCliSettings
  notifications: NotificationSettings
  agentTemplates: AgentTemplate[]
  workspaceLayouts: WorkspaceLayout[]
  activeLayoutName: string
  extensionsEnabled: boolean
  disabledExtensions: string[]
  lspEnabled: boolean
  lspServers: Record<string, string>
  claudeAutoLaunch: boolean
  approvalRequired: string[]
  approvalTimeout: number
  workspaceSnapshots: WorkspaceSnapshot[]
  terminalCursorStyle: 'block' | 'underline' | 'bar'
  commandBlocksEnabled: boolean
  promptPattern: string
  /** Format document before saving (requires a formatting provider in Monaco) */
  formatOnSave: boolean
}

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

export type AgentEventType =
  | 'agent_start'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'agent_end'
  | 'agent_stop'
  | 'session_start'
  | 'session_stop'

export interface AgentEvent {
  type: AgentEventType
  sessionId?: string
  agentId?: string
  timestamp: number
  payload: unknown
}

export interface TokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface HookPayload {
  type: AgentEventType
  sessionId: string
  timestamp: number
  toolName?: string
  toolCallId?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  prompt?: string
  error?: string
  parentSessionId?: string
  usage?: TokenUsage
  model?: string
  requestId?: string
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

export interface IpcResult {
  success: boolean
  error?: string
}

export interface ReadFileResult extends IpcResult {
  content?: string
}

export interface ReadBinaryFileResult extends IpcResult {
  data?: Uint8Array
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

export interface ExtensionInfo {
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  status: 'active' | 'inactive' | 'pending' | 'error'
  permissions: string[]
  activationEvents: string[]
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
  activate: (name: string) => Promise<IpcResult>
  commandExecuted: (commandId: string) => Promise<IpcResult>
  onNotification: (callback: (data: { extensionName: string; message: string }) => void) => () => void
}
