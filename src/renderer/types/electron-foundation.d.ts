import type { AgentChatSettings } from '@shared/types/agentChat';

import type { ClaudeMdSettings } from './electron-claude-md';

export type AppTheme =
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

export interface ClaudeCliSettings {
  permissionMode: string;
  model: string;
  effort: string;
  appendSystemPrompt: string;
  verbose: boolean;
  maxBudgetUsd: number;
  allowedTools: string;
  disallowedTools: string;
  addDirs: string[];
  chrome: boolean;
  worktree: boolean;
  dangerouslySkipPermissions: boolean;
}

export interface CodexCliSettings {
  model: string;
  reasoningEffort: string;
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy: 'untrusted' | 'on-request' | 'never';
  profile: string;
  addDirs: string[];
  search: boolean;
  skipGitRepoCheck: boolean;
  dangerouslyBypassApprovalsAndSandbox: boolean;
}

export interface CodexModelOption {
  id: string;
  name: string;
  description?: string;
  reasoningEfforts: string[];
  contextWindow?: number;
  effectiveContextWindowPercent?: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  icon?: string;
  promptTemplate: string;
  cliOverrides?: Partial<ClaudeCliSettings>;
}

export interface NotificationSettings {
  level: string;
  alwaysNotify: boolean;
}

export interface WorkspaceLayout {
  name: string;
  panelSizes: PanelSizes;
  visiblePanels: {
    leftSidebar: boolean;
    rightSidebar: boolean;
    terminal: boolean;
  };
  rightSidebarTab?: string;
  builtIn?: boolean;
}

export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
}

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
  enabled: boolean;
  builtIn?: boolean;
}

export interface ModelSlotAssignments {
  terminal: string;
  agentChat: string;
  claudeMdGeneration: string;
  inlineCompletion: string;
}

export interface RouterSettings {
  enabled: boolean;
  layer1Enabled: boolean;
  layer2Enabled: boolean;
  layer3Enabled: boolean;
  layer2ConfidenceThreshold: number;
  paranoidMode: boolean;
  /** Fraction of decisions sampled for LLM judge scoring (0 = disabled). */
  llmJudgeSampleRate: number;
}

export interface WorkspaceSnapshot {
  id: string;
  commitHash: string;
  sessionId: string;
  sessionLabel?: string;
  timestamp: number;
  type: 'session-start' | 'session-end' | 'manual';
  fileCount?: number;
  projectRoot?: string;
}

export interface AppConfig {
  recentProjects: string[];
  defaultProjectRoot: string;
  activeTheme: AppTheme;
  activeFileIconTheme: string;
  activeProductIconTheme: string;
  hooksServerPort: number;
  terminalFontSize: number;
  autoInstallHooks: boolean;
  shell: string;
  panelSizes: PanelSizes;
  windowBounds: WindowBounds;
  fontUI: string;
  fontMono: string;
  fontSizeUI: number;
  keybindings: Record<string, string>;
  showBgGradient: boolean;
  customThemeColors: Record<string, string>;
  terminalSessions: Array<{
    cwd: string;
    title: string;
    isClaude?: boolean;
    isCodex?: boolean;
    claudeSessionId?: string;
    codexThreadId?: string;
  }>;
  customCSS: string;
  bookmarks: string[];
  fileTreeIgnorePatterns: string[];
  /** Wave 26 Phase A — user profiles (built-ins are merged at read time, never stored) */
  profiles?: import('@shared/types/profile').Profile[];
  multiRoots: string[];
  customPrompt: string;
  promptPreset: string;
  claudeCliSettings: ClaudeCliSettings;
  codexCliSettings: CodexCliSettings;
  agentChatSettings: AgentChatSettings;
  notifications: NotificationSettings;
  agentTemplates: AgentTemplate[];
  workspaceLayouts: WorkspaceLayout[];
  activeLayoutName: string;
  extensionsEnabled: boolean;
  disabledExtensions: string[];
  installedVsxExtensions: Array<{
    id: string;
    namespace: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    installPath: string;
    installedAt: string;
    contributes: {
      themes?: Array<{ label: string; uiTheme: string; path: string }>;
      iconThemes?: Array<{ id: string; label: string; path: string }>;
      productIconThemes?: Array<{ id: string; label: string; path: string }>;
      grammars?: Array<{ language: string; scopeName: string; path: string }>;
      snippets?: Array<{ language: string; path: string }>;
      languages?: Array<{ id: string; extensions?: string[]; configuration?: string }>;
    };
  }>;
  disabledVsxExtensions: string[];
  lspEnabled: boolean;
  lspServers: Record<string, string>;
  inlineCompletionsEnabled: boolean;
  /** Whether semantic codebase search (vector embeddings) is enabled */
  embeddingsEnabled: boolean;
  /** Embedding provider: 'local' (Xenova ONNX) or 'voyage' (Voyage AI API) */
  embeddingProvider: 'local' | 'voyage';
  /** Voyage AI API key (used when embeddingProvider === 'voyage') */
  voyageApiKey: string;
  claudeAutoLaunch: boolean;
  approvalRequired: string[];
  approvalTimeout: number;
  workspaceSnapshots: WorkspaceSnapshot[];
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  commandBlocksEnabled: boolean;
  promptPattern: string;
  /** Format document before saving (requires a formatting provider in Monaco) */
  formatOnSave: boolean;
  contextLayer: ContextLayerConfig;
  claudeMdSettings: ClaudeMdSettings;
  modelProviders: ModelProvider[];
  modelSlots: ModelSlotAssignments;
  routerSettings: RouterSettings;
  webAccessPort: number;
  /** @internal — do not expose in Settings UI */
  webAccessToken: string;
  /** @internal — do not expose in Settings UI */
  webAccessPassword: string;
  glassOpacity: number;
  authOnboardingDismissed: boolean;
  /** Create a git checkpoint commit before applying AI-generated diffs. Default: true. */
  autoCheckpoint: boolean;
  /** Wave 6 (issue 116) — token-by-token streaming for Ctrl+K inline edits. Default: false. */
  streamingInlineEdit: boolean;
  /** Wave 6 (issue 103) — max concurrent background agent jobs. Default: 2. */
  backgroundJobsMaxConcurrent: number;
  /** Wave 8 (issue 115) — persist PTY session descriptors to SQLite for cross-restart restore. Default: false. */
  persistTerminalSessions: boolean;
  /** Wave 3B feature flag — route PTY through PtyHost utility process */
  usePtyHost: boolean;
  /** Wave 3B feature flag — route extensions through ExtensionHost utility process */
  useExtensionHost: boolean;
  /** Wave 3B feature flag — run internal MCP server in dedicated McpHost utility process */
  useMcpHost: boolean;
  /** @internal — do not expose in Settings UI */
  routerLastRetrainCount: number;
  /** Wave 17 — layout preset engine feature flags */
  layout?: { presets?: { v2?: boolean } };
  /** Wave 22 Phase B/E — chat message density + desktop notification settings. */
  chat?: {
    density?: 'comfortable' | 'compact';
    /** Wave 22 Phase E — fire desktop notification on stream completion (unfocused only). Default: true. */
    desktopNotifications?: boolean;
  };
  /** Wave 25 Phase E — workspace read-list: projectRoot → string[] of file paths auto-pinned at session open */
  workspaceReadLists?: Record<string, string[]>;
  /** Wave 27 — subagent UX feature flags */
  agentic?: { subagentUx?: boolean };
}

export interface ContextLayerConfig {
  enabled: boolean;
  maxModules: number;
  maxSizeBytes: number;
  debounceMs: number;
  autoSummarize: boolean;
  moduleDepthLimit: number;
}

export type {
  BufferExcerpt,
  DirEntry,
  FileChangeEvent,
  FileChangeType,
  MultiBufferConfig,
} from './electron-file-types';

export type AgentEventType =
  // Lifecycle
  | 'session_start'
  | 'session_end'
  | 'session_stop'
  | 'stop_failure'
  | 'setup'
  // Tools
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'post_tool_use_failure'
  // Agents
  | 'agent_start'
  | 'agent_end'
  | 'agent_stop'
  | 'teammate_idle'
  // Tasks
  | 'task_created'
  | 'task_completed'
  | 'user_prompt_submit'
  | 'elicitation'
  | 'elicitation_result'
  | 'notification'
  | 'cwd_changed'
  | 'file_changed'
  | 'worktree_create'
  | 'worktree_remove'
  | 'config_change'
  | 'pre_compact'
  | 'post_compact'
  | 'instructions_loaded'
  | 'permission_request'
  | 'permission_denied';

export interface AgentEvent {
  type: AgentEventType;
  sessionId?: string;
  agentId?: string;
  timestamp: number;
  payload: unknown;
}

export interface RawApiTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface HookPayload {
  type: AgentEventType;
  sessionId: string;
  timestamp: number;
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
  cwd?: string;
  internal?: boolean;
  /** True when the event originates from a Claude Code process spawned inside the IDE. */
  ideSpawned?: boolean;
  costUsd?: number;
  parentToolCallId?: string;
  taskLabel?: string;
  data?: Record<string, unknown>;
}

export type {
  IpcResult,
  ReadBinaryFileResult,
  ReadDirResult,
  ReadFileResult,
  SelectFolderResult,
  ToolCallEvent,
  ToolCallPayload,
} from './electron-ipc-results';
