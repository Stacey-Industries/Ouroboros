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
  /** Wave 17 — layout preset engine feature flags
   *  Wave 28 — dragAndDrop: enable drag-and-drop pane rearrangement
   *  Wave 32 — mobilePrimary: enable mobile-primary preset when viewport < 768px */
  layout?: { presets?: { v2?: boolean }; chatPrimary?: boolean; dragAndDrop?: boolean; mobilePrimary?: boolean };
  /** Wave 22 Phase B/E — chat message density + desktop notification settings. Wave 22 Phase E adds desktopNotifications. */
  chat?: { density?: 'comfortable' | 'compact'; desktopNotifications?: boolean };
  /** Wave 25 Phase E — workspace read-list: projectRoot → string[] of file paths auto-pinned at session open */
  workspaceReadLists?: Record<string, string[]>;
  /** Wave 27 — subagent UX feature flags */
  agentic?: { subagentUx?: boolean };
  /** Wave 29 Phase A — diff review enhanced UX (keyboard shortcuts + rollback) */
  review?: { enhanced?: boolean };
  /** Wave 30 Phases G+I — research auto-firing defaults + threshold knobs. */
  researchSettings?: { globalEnabled?: boolean; defaultMode?: 'off' | 'conservative' | 'aggressive'; stalenessConfidenceFloor?: number; factClaimEnabled?: boolean; factClaimMinPatternConfidence?: 'high' | 'medium' | 'low'; preEditDryRunOnly?: boolean; maxLatencyMs?: number };
  /** Wave 19/24/31 — context scoring feature flags. Wave 31 Phase E adds packetMode. */
  context?: { provenanceWeights?: boolean; pagerank?: boolean; pagerankSeeds?: { pinned?: number; symbol?: number; user_edit?: number }; decisionLogging?: boolean; rerankerEnabled?: boolean; packetMode?: 'full' | 'lean' };
  /** Wave 33a Phase A — mobile client pairing + device registry. */
  mobileAccess?: { enabled: boolean; pairedDevices: Array<{ id: string; label: string; refreshTokenHash: string; fingerprint: string; capabilities: string[]; issuedAt: string; lastSeenAt: string }> };
  /** Wave 34 Phase A — cross-device session dispatch queue + settings. */
  sessionDispatch?: { enabled: boolean; maxConcurrent: number; jobTimeoutMs: number; queue: Array<{ id: string; request: { title: string; prompt: string; projectPath: string; worktreeName?: string }; status: 'queued' | 'starting' | 'running' | 'completed' | 'failed' | 'canceled'; createdAt: string; startedAt?: string; endedAt?: string; sessionId?: string; error?: string; deviceId?: string }> };
  /** Wave 35+36 — per-user theming overrides; providers.multiProvider gates non-Claude session providers. */
  theming?: { accentOverride?: string; verbOverride?: string; thinkingVerbs?: string[]; spinnerChars?: string; fonts?: { editor?: string; chat?: string; terminal?: string }; customTokens?: Record<string, string> }; providers?: { multiProvider?: boolean };
  /** Wave 37 Phase B+C — ecosystem moat: prompt-diff snapshot + usage export metadata. */
  ecosystem?: { lastSeenSnapshot?: { cliVersion: string; capturedAt: number; promptHash: string; promptText: string }; lastExport?: { path: string; at: number; rows: number } };
  /** Wave 38 Phase A+C — platform settings: onboarding, language, update channel, crash reporter, changelog gate. Phase C adds dismissedEmptyStates. */
  platform?: { onboarding?: { completed?: boolean }; language?: 'en' | 'es'; updateChannel?: 'stable' | 'beta'; crashReports?: { enabled?: boolean; webhookUrl?: string }; lastSeenVersion?: string; dismissedEmptyStates?: Record<string, boolean> };
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

export type { IpcResult, ReadBinaryFileResult, ReadDirResult, ReadFileResult, SelectFolderResult, ToolCallEvent, ToolCallPayload } from './electron-ipc-results';
