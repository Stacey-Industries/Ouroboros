# Data Model

## Persisted State (electron-store)

All persistent config is managed by `src/main/config.ts` using `electron-store`.
Schema validation happens at the store level — the renderer treats it as opaque.

### AppConfig

```typescript
type AppTheme =
  | 'retro'
  | 'modern'
  | 'warp'
  | 'cursor'
  | 'kiro'
  | 'glass'
  | 'light'
  | 'high-contrast'
  | 'custom'
  | (string & {});

interface AppConfig {
  // Project
  recentProjects: string[]; // MRU list, max 10 entries
  defaultProjectRoot: string; // Last-opened folder path (or '')
  multiRoots: string[]; // All open project roots (multi-root workspace)
  bookmarks: string[]; // Absolute paths pinned to top of file tree
  fileTreeIgnorePatterns: string[]; // Extra ignore patterns merged with hardcoded list

  // Appearance
  activeTheme: AppTheme;
  showBgGradient: boolean;
  customThemeColors: Record<string, string>;
  customCSS: string;
  glassOpacity: number; // Glass theme transparency
  fontUI: string; // UI font family
  fontMono: string; // Monospace font family
  fontSizeUI: number; // UI font size

  // Window
  windowBounds: WindowBounds; // Persisted window position/size
  panelSizes: PanelSizes; // Persisted panel dimensions
  activeLayoutName: string; // Name of active workspace layout
  workspaceLayouts: WorkspaceLayout[]; // Saved panel arrangements

  // Terminal
  hooksServerPort: number; // TCP fallback port (default: 3333, range: 1024-65535)
  terminalFontSize: number; // Terminal font size (default: 14, range: 8-32)
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  commandBlocksEnabled: boolean; // Warp-style command block overlay
  promptPattern: string; // Custom regex for prompt detection
  customPrompt: string; // Custom PS1 (empty = shell default)
  promptPreset: string; // 'default' | 'minimal' | 'powerline' | 'git' | 'custom'
  shell: string; // Override shell executable
  terminalSessions: TerminalSessionSnapshot[]; // Session restore data

  // Keybindings
  keybindings: Record<string, string>; // action ID → shortcut string

  // Claude CLI
  claudeCliSettings: ClaudeCliSettings;
  claudeAutoLaunch: boolean; // Auto-launch Claude session on startup
  agentTemplates: AgentTemplate[]; // Pre-configured launch profiles

  // Codex CLI
  codexCliSettings: CodexCliSettings;

  // Agent Chat
  agentChatSettings: AgentChatSettings;

  // Context Layer
  contextLayer: ContextLayerConfig;

  // CLAUDE.md generation
  claudeMdSettings: ClaudeMdSettings;

  // Model providers
  modelProviders: ModelProvider[]; // Configured Anthropic-compatible endpoints
  modelSlots: ModelSlotAssignments; // Which provider:model for each session type

  // Hooks / Approval
  autoInstallHooks: boolean; // Auto-install Claude Code hooks on startup
  approvalRequired: string[]; // Tool names requiring user approval
  approvalTimeout: number; // Auto-approve after N seconds (0 = never)

  // Extensions
  extensionsEnabled: boolean;
  disabledExtensions: string[];
  installedVsxExtensions: VsxExtension[]; // VS Code extensions from Open VSX
  disabledVsxExtensions: string[];

  // LSP
  lspEnabled: boolean;
  lspServers: Record<string, string>; // language id → server command

  // Notifications
  notifications: NotificationSettings;

  // Profiles
  profiles: Record<string, Partial<Omit<AppConfig, 'profiles'>>>;

  // Time travel
  workspaceSnapshots: WorkspaceSnapshot[]; // Capped at 100

  // Editor
  formatOnSave: boolean;

  // Web remote access
  webAccessPort: number; // default: 7890
  webAccessPassword: string;
}

interface PanelSizes {
  leftSidebar: number; // default: 220, range: 140-480
  rightSidebar: number; // default: 300, range: 200-600
  terminal: number; // default: 280, range: 120-600
}

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

interface TerminalSessionSnapshot {
  cwd: string;
  title: string;
  isClaude?: boolean;
  isCodex?: boolean;
  claudeSessionId?: string; // Used to restore with --resume <id>
  codexThreadId?: string; // Used to restore with `codex resume <id>`
}

interface ClaudeCliSettings {
  permissionMode: string; // 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'
  model: string; // '' = CLI default; e.g. 'sonnet', 'opus', full model ID
  effort: string; // 'low' | 'medium' | 'high' | 'max'
  appendSystemPrompt: string;
  verbose: boolean;
  maxBudgetUsd: number; // 0 = unlimited
  allowedTools: string; // comma-separated, empty = all
  disallowedTools: string; // comma-separated, empty = none
  addDirs: string[];
  chrome: boolean; // Claude in Chrome integration
  worktree: boolean; // Use git worktree for sessions
  dangerouslySkipPermissions: boolean;
}

interface CodexCliSettings {
  model: string;
  reasoningEffort: string; // 'low' | 'medium' | 'high' | 'xhigh'
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy: 'untrusted' | 'on-request' | 'never';
  profile: string; // Config profile from ~/.codex/config.toml
  addDirs: string[];
  search: boolean; // Live web search
  skipGitRepoCheck: boolean;
  dangerouslyBypassApprovalsAndSandbox: boolean;
}

interface NotificationSettings {
  level: string; // 'all' | 'errors-only' | 'none'
  alwaysNotify: boolean; // Notify even when app is focused
}

interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
  enabled: boolean;
  builtIn?: boolean;
}

interface ProviderModel {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
}

interface ModelSlotAssignments {
  terminal: string; // 'providerId:modelId' for Claude Code terminals
  agentChat: string; // Model for agent chat subagent sessions
  claudeMdGeneration: string; // Model for CLAUDE.md generation
}

interface WorkspaceLayout {
  name: string;
  panelSizes: PanelSizes;
  visiblePanels: { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean };
  rightSidebarTab?: string;
  builtIn?: boolean;
}

interface WorkspaceSnapshot {
  id: string;
  commitHash: string;
  sessionId: string;
  sessionLabel?: string;
  timestamp: number;
  type: 'session-start' | 'session-end' | 'manual';
  fileCount?: number;
  projectRoot?: string;
}

interface AgentTemplate {
  id: string;
  name: string;
  icon?: string;
  promptTemplate: string; // Supports {{projectRoot}}, {{projectName}}, {{openFile}}, {{openFileName}}
  cliOverrides?: Partial<ClaudeCliSettings>;
}

interface ClaudeMdSettings {
  enabled: boolean;
  triggerMode: 'post-session' | 'post-commit' | 'manual';
  model: 'haiku' | 'sonnet' | 'opus';
  autoCommit: boolean;
  generateRoot: boolean;
  generateSubdirs: boolean;
  excludeDirs: string[];
}

interface ContextLayerConfig {
  enabled: boolean;
  maxModules: number;
  maxSizeBytes: number;
  debounceMs: number;
  autoSummarize: boolean;
  moduleDepthLimit: number;
}
```

### Storage Location

- Windows: `%APPDATA%/agent-ide/config.json`
- macOS: `~/Library/Application Support/agent-ide/config.json`
- Linux: `~/.config/agent-ide/config.json`

## Renderer State

### Panel Sizes (localStorage)

Key: `agent-ide:panel-sizes` — JSON of `PanelSizes` (leftSidebar/rightSidebar/terminal in px). Mirrors electron-store but used for instant hydration without IPC round-trip.

### Panel Collapse State (localStorage)

Key: `agent-ide:panel-collapse` — JSON of `{ leftSidebar: boolean, rightSidebar: boolean, terminal: boolean }`.

### ProjectContext (React context)

```typescript
interface ProjectContextValue {
  projectRoot: string | null; // Absolute path of open folder
  projectName: string; // basename(projectRoot)
  setProjectRoot: (path: string) => void;
  clearProject: () => void;
}
```

Seeded from `config.defaultProjectRoot` on boot. Updated when user selects a folder.

### FileViewerManager (React context)

```typescript
interface OpenFile {
  path: string; // Absolute file path
  name: string; // basename
  content: string | null; // File content (null while loading)
  isLoading: boolean;
  error: string | null;
  isDirtyOnDisk: boolean; // Set when chokidar reports change
}

// State: OpenFile[], activeIndex
```

### TerminalManager (component state)

```typescript
interface TerminalSession {
  id: string; // 'term-{timestamp}-{random}'
  title: string; // From OSC sequence or 'Terminal N'
  status: 'running' | 'exited';
}

// State: TerminalSession[], activeSessionId
```

### Agent Chat (SQLite, in renderer via IPC)

```typescript
type AgentChatThreadStatus =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'verifying'
  | 'needs_review'
  | 'complete'
  | 'failed'
  | 'cancelled';

type AgentChatMessageRole = 'user' | 'assistant' | 'system' | 'status';

// Threads and messages persisted in SQLite (userData/agent-chat.db).
// JSON file fallback lives in userData/agent-chat/threads/{sha1(threadId)}.json.
// Max 100 threads per workspace root.
```

### PTY Sessions (main process, in-memory Map)

```typescript
interface PtySession {
  id: string;
  process: pty.IPty; // node-pty handle
  cwd: string;
  shell: string;
}
// Stored in: Map<string, PtySession>
```

## Event Types

### Hook Events (from Claude Code)

```typescript
type AgentEventType =
  | 'agent_start'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'agent_end'
  | 'agent_stop'
  | 'session_start'
  | 'session_stop';

interface HookPayload {
  type: AgentEventType;
  sessionId: string;
  timestamp: number; // Unix epoch ms
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  prompt?: string;
  error?: string;
  parentSessionId?: string;
  usage?: RawApiTokenUsage;
  model?: string;
  requestId?: string;
  cwd?: string; // Working directory of the Claude Code session
}

interface RawApiTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
```

### Agent Events (renderer-side abstraction)

```typescript
interface AgentEvent {
  type: AgentEventType; // Same union as HookPayload.type
  sessionId?: string;
  agentId?: string;
  timestamp: number;
  payload: unknown;
}
```

### File Change Events

```typescript
type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

interface FileChangeEvent {
  type: FileChangeType;
  path: string; // Absolute path
}
```

## Theme Definitions

Each theme is a TypeScript object mapping CSS custom property names to values:

```typescript
interface ThemeDefinition {
  id: AppTheme;
  name: string;
  vars: Record<string, string>; // e.g. { '--bg': '#0d1117', '--text': '#e6edf3', ... }
}
```

Available themes: `retro`, `modern` (default), `warp`, `cursor`, `kiro`.
Applied by setting CSS vars on `document.documentElement.style`.
