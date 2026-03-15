import Store from 'electron-store'
import { schema } from './configSchema'

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

export interface TerminalSessionSnapshot {
  cwd: string
  title: string
  isClaude?: boolean
  /** Claude Code session UUID — used to restore with --resume <id> */
  claudeSessionId?: string
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

export interface NotificationSettings {
  /** 'all' | 'errors-only' | 'none' */
  level: string
  /** Whether to notify even when the app is focused */
  alwaysNotify: boolean
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
}

export interface AppConfig {
  recentProjects: string[]
  defaultProjectRoot: string
  activeTheme: 'retro' | 'modern' | 'warp' | 'cursor' | 'kiro' | 'custom'
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
  terminalSessions: TerminalSessionSnapshot[]
  customCSS: string
  /** Absolute paths pinned to the top of the file tree */
  bookmarks: string[]
  /** Extra ignore patterns (exact names or glob-like prefixes) merged with the hardcoded list */
  fileTreeIgnorePatterns: string[]
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
  /** Auto-launch a Claude Code session on startup instead of a plain shell */
  claudeAutoLaunch: boolean
  /** Tool names that require user approval before execution */
  approvalRequired: string[]
  /** Auto-approve after N seconds (0 = never auto-approve) */
  approvalTimeout: number
  /** Workspace time-travel snapshots (capped at 100) */
  workspaceSnapshots: WorkspaceSnapshot[]
  /** Terminal cursor style: 'block' | 'underline' | 'bar' */
  terminalCursorStyle: 'block' | 'underline' | 'bar'
  /** Enable Warp-style command block overlay on terminals */
  commandBlocksEnabled: boolean
  /** Custom regex pattern for prompt detection (heuristic fallback) */
  promptPattern: string
  /** Enable the rich multi-line input for the terminal */
  richInputEnabled: boolean
  /** Submit key for the rich input: 'ctrl+enter' or 'shift+enter' */
  richInputSubmitKey: 'ctrl+enter' | 'shift+enter'
  /** Format document before saving (requires a formatting provider in Monaco) */
  formatOnSave: boolean
}

export const store = new Store<AppConfig>({ schema })

export function getConfig(): AppConfig {
  return store.store
}

export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return store.get(key)
}

export function setConfigValue<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
  store.set(key, value)
}

export function addRecentProject(projectPath: string): void {
  const recent = store.get('recentProjects') as string[]
  const filtered = recent.filter((p) => p !== projectPath)
  const updated = [projectPath, ...filtered].slice(0, 10)
  store.set('recentProjects', updated)
}
