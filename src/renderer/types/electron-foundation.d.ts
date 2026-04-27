import type { AgentChatSettings } from '@shared/types/agentChat';

import type { ClaudeMdSettings } from './electron-claude-md';
import type { ContextLayerConfig, PlatformConfig } from './electron-config-slices';

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

/** Wave 30 — research auto-firing settings. */
export interface ResearchSettings {
  globalEnabled?: boolean;
  defaultMode?: 'off' | 'conservative' | 'aggressive';
  stalenessConfidenceFloor?: number;
  factClaimEnabled?: boolean;
  factClaimMinPatternConfidence?: 'high' | 'medium' | 'low';
  preEditDryRunOnly?: boolean;
  maxLatencyMs?: number;
}

/** Wave 35 — per-user theming overrides. */
export interface ThemingOverrides {
  accentOverride?: string;
  verbOverride?: string;
  thinkingVerbs?: string[];
  spinnerChars?: string;
  fonts?: { editor?: string; chat?: string; terminal?: string };
  customTokens?: Record<string, string>;
}

/** Wave 37 — ecosystem moat settings. */
export interface EcosystemSettings {
  // prettier-ignore
  lastSeenSnapshot?: { cliVersion: string; capturedAt: number; promptHash: string; promptText: string };
  lastExport?: { path: string; at: number; rows: number };
  codexAppServerTransport?: boolean;
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
  /** Wave 45 — material variant (Vapor / Prism / Warp) */
  materialVariant: 'vapor' | 'prism' | 'warp';
  authOnboardingDismissed: boolean;
  /** Create a git checkpoint commit before applying AI-generated diffs. Default: true. */
  autoCheckpoint: boolean;
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
  /** Wave 17–44 layout flags; Wave 59A chatWorkbench retired (workbench IS the chat shell). */
  layout?: {
    presets?: { v2?: boolean };
    dragAndDrop?: boolean;
    mobilePrimary?: boolean;
    immersiveChat?: boolean;
    chatSidebarMode?: 'pinned' | 'collapsed' | 'hidden';
  };
  /** Wave 22 Phase B/E — chat message density + desktop notification settings. Wave 22 Phase E adds desktopNotifications. */
  chat?: { density?: 'comfortable' | 'compact'; desktopNotifications?: boolean };
  /** Wave 25 Phase E — workspace read-list: projectRoot → string[] of file paths auto-pinned at session open */
  workspaceReadLists?: Record<string, string[]>;
  /** Wave 27 — subagent UX feature flags */
  agentic?: { subagentUx?: boolean };
  /** Wave 29 Phase A — diff review enhanced UX (keyboard shortcuts + rollback) */
  review?: { enhanced?: boolean };
  /** Wave 30 Phases G+I — research auto-firing defaults + threshold knobs. */
  researchSettings?: ResearchSettings;
  /** Wave 19/24/31 — context scoring feature flags. Wave 31 Phase E adds packetMode. */
  context?: {
    provenanceWeights?: boolean;
    pagerank?: boolean;
    pagerankSeeds?: { pinned?: number; symbol?: number; user_edit?: number };
    decisionLogging?: boolean;
    rerankerEnabled?: boolean;
    packetMode?: 'full' | 'lean' | 'auto';
  };
  /** Wave 33a Phase A — mobile client pairing + device registry. */
  mobileAccess?: {
    enabled: boolean;
    pairedDevices: Array<{
      id: string;
      label: string;
      refreshTokenHash: string;
      fingerprint: string;
      capabilities: string[];
      issuedAt: string;
      lastSeenAt: string;
    }>;
  };
  /** Wave 34 Phase A — cross-device session dispatch queue + settings. */
  sessionDispatch?: {
    enabled: boolean;
    maxConcurrent: number;
    jobTimeoutMs: number;
    queue: Array<{
      id: string;
      request: { title: string; prompt: string; projectPath: string; worktreeName?: string };
      status: 'queued' | 'starting' | 'running' | 'completed' | 'failed' | 'canceled';
      createdAt: string;
      startedAt?: string;
      endedAt?: string;
      sessionId?: string;
      error?: string;
      deviceId?: string;
    }>;
  };
  /** Wave 35+36 — per-user theming overrides; providers.multiProvider gates non-Claude providers. */
  theming?: ThemingOverrides;
  providers?: { multiProvider?: boolean };
  /** Wave 37/45 — ecosystem moat + codexAppServerTransport. */
  ecosystem?: EcosystemSettings;
  /** Wave 38 Phase A+C — platform settings: onboarding, language, update channel, crash reporter, changelog gate. Phase C adds dismissedEmptyStates. */
  platform?: PlatformConfig;
}

export type {
  AgentEvent,
  AgentEventType,
  HookPayload,
  RawApiTokenUsage,
} from './electron-agent-events';
export type { ContextLayerConfig, PlatformConfig } from './electron-config-slices';
export type {
  BufferExcerpt,
  DirEntry,
  FileChangeEvent,
  FileChangeType,
  MultiBufferConfig,
} from './electron-file-types';
export type {
  IpcResult,
  ReadBinaryFileResult,
  ReadDirResult,
  ReadFileResult,
  SelectFolderResult,
  ToolCallEvent,
  ToolCallPayload,
} from './electron-ipc-results';
