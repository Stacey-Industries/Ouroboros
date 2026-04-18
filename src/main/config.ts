import Store from 'electron-store';

import type { AgentChatSettings } from './agentChat/types';
import { schema } from './configSchema';
import type { ContextLayerConfig } from './contextLayer/contextLayerTypes';
import type { Session } from './session';
import type { SessionFolder } from './session/folderStore';

/** Wave 33a Phase A — a device that has completed the pairing flow. */
export interface PairedDeviceRecord {
  id: string;
  label: string;
  refreshTokenHash: string;
  fingerprint: string;
  capabilities: string[];
  issuedAt: string;
  lastSeenAt: string;
}

/** Wave 33a Phase A — mobileAccess config slice. */
export interface MobileAccessConfig {
  enabled: boolean;
  pairedDevices: PairedDeviceRecord[];
}

export interface PanelSizes {
  leftSidebar: number;
  rightSidebar: number;
  terminal: number;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export interface WindowSession {
  projectRoots: string[];
  bounds?: WindowBounds;
}

export interface TerminalSessionSnapshot {
  cwd: string;
  title: string;
  isClaude?: boolean;
  isCodex?: boolean;
  /** Claude Code session UUID — used to restore with --resume <id> */
  claudeSessionId?: string;
  /** Codex thread UUID — used to restore with `codex resume <id>` */
  codexThreadId?: string;
}

export interface ClaudeCliSettings {
  /** Permission mode: 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' */
  permissionMode: string;
  /** Model override: '' means CLI default. e.g. 'sonnet', 'opus', 'haiku', or full model ID */
  model: string;
  /** Effort level: 'low' | 'medium' | 'high' | 'max' */
  effort: string;
  /** Extra system prompt appended to default */
  appendSystemPrompt: string;
  /** Verbose output */
  verbose: boolean;
  /** Max budget in USD (0 = unlimited) */
  maxBudgetUsd: number;
  /** Allowed tools (comma-separated, empty = all) */
  allowedTools: string;
  /** Disallowed tools (comma-separated, empty = none) */
  disallowedTools: string;
  /** Additional directories to allow tool access */
  addDirs: string[];
  /** Enable Claude in Chrome integration */
  chrome: boolean;
  /** Use git worktree for sessions */
  worktree: boolean;
  /** Dangerously skip all permission checks */
  dangerouslySkipPermissions: boolean;
}

export interface CodexCliSettings {
  /** Model override: '' means CLI default. e.g. 'gpt-5.4' */
  model: string;
  /** Reasoning effort override: 'low' | 'medium' | 'high' | 'xhigh' */
  reasoningEffort: string;
  /** Sandbox mode for command execution */
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  /** Approval policy for command execution */
  approvalPolicy: 'untrusted' | 'on-request' | 'never';
  /** Optional config profile from ~/.codex/config.toml */
  profile: string;
  /** Additional directories Codex can write to */
  addDirs: string[];
  /** Enable live web search */
  search: boolean;
  /** Allow running outside a git repository */
  skipGitRepoCheck: boolean;
  /** Dangerously bypass approvals and sandbox entirely */
  dangerouslyBypassApprovalsAndSandbox: boolean;
}

export interface NotificationSettings {
  /** 'all' | 'errors-only' | 'none' */
  level: string;
  /** Whether to notify even when the app is focused */
  alwaysNotify: boolean;
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
  /** Model for interactive Claude Code terminals (format: 'providerId:modelId') */
  terminal: string;
  /** Model for agent chat subagent sessions */
  agentChat: string;
  /** Model for CLAUDE.md generation */
  claudeMdGeneration: string;
  /** Model for inline AI completions (ghost text) */
  inlineCompletion: string;
}

export interface ClaudeMdSettings {
  /** Master toggle for CLAUDE.md automation */
  enabled: boolean;
  /** When to trigger generation */
  triggerMode: 'post-session' | 'post-commit' | 'manual';
  /** Which model to use for generation */
  model: 'haiku' | 'sonnet' | 'opus';
  /** Auto-commit generated CLAUDE.md files */
  autoCommit: boolean;
  /** Generate root CLAUDE.md */
  generateRoot: boolean;
  /** Generate subdirectory CLAUDE.md files */
  generateSubdirs: boolean;
  /** Directories to exclude from generation */
  excludeDirs: string[];
}

export interface CodebaseGraphSettings {
  /** Enable GC pruning of stale project graphs on startup */
  gcEnabled: boolean;
  /** Prune projects not opened within this many days (default: 90, max: 3650) */
  gcDaysThreshold: number;
}

export interface PageRankSeedWeights {
  /** Weight for pinned files in the personalization vector (default 0.5). */
  pinned: number;
  /** Weight for keyword-matched files in the personalization vector (default 0.3). */
  symbol: number;
  /** Weight for recently user-edited files in the personalization vector (default 0.2). */
  user_edit: number;
}

export interface ContextScoringSettings {
  /** Enable provenance-aware weight split (recent_user_edit / recent_agent_edit). Default on. */
  provenanceWeights: boolean;
  /** Enable PageRank-based retrieval. Default on. */
  pagerank: boolean;
  /** Tunable seed weights for personalized PageRank (Q10 rec). */
  pagerankSeeds: PageRankSeedWeights;
  /** Enable LLM-based context reranking via Haiku subprocess. Default on. */
  rerankerEnabled?: boolean;
  /** Wave 31 Phase E — lean packet mode: drop project_structure, cap relevant_code to 6 files. */
  packetMode?: 'full' | 'lean';
  /** Wave 31 Phase D — use learned logistic classifier for context ranking instead of additive path. */
  learnedRanker?: boolean;
}

export interface RouterSettings {
  /** Master toggle — when false, router is bypassed entirely. */
  enabled: boolean;
  /** Enable the deterministic rule engine (Layer 1). */
  layer1Enabled: boolean;
  /** Enable the ML classifier (Layer 2). */
  layer2Enabled: boolean;
  /** Enable the Haiku LLM fallback (Layer 3). */
  layer3Enabled: boolean;
  /** Classifier confidence below this → low confidence → try next layer. */
  layer2ConfidenceThreshold: number;
  /** Always route to Opus regardless of classification. */
  paranoidMode: boolean;
  /** Fraction of decisions sampled for LLM judge scoring (0 = disabled). */
  llmJudgeSampleRate: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  icon?: string;
  /** Supports {{projectRoot}}, {{projectName}}, {{openFile}}, {{openFileName}} */
  promptTemplate: string;
  /** Optional per-template CLI overrides (merged with global settings) */
  cliOverrides?: Partial<ClaudeCliSettings>;
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

export interface WorkspaceSnapshot {
  id: string;
  commitHash: string;
  sessionId: string;
  sessionLabel?: string;
  timestamp: number;
  type: 'session-start' | 'session-end' | 'manual';
  fileCount?: number;
}

export interface AppConfig {
  recentProjects: string[];
  defaultProjectRoot: string;
  activeTheme:
    | 'retro'
    | 'modern'
    | 'warp'
    | 'cursor'
    | 'kiro'
    | 'glass'
    | 'light'
    | 'high-contrast'
    | 'custom';
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
  terminalSessions: TerminalSessionSnapshot[];
  customCSS: string;
  /** Absolute paths pinned to the top of the file tree */
  bookmarks: string[];
  /** Extra ignore patterns (exact names or glob-like prefixes) merged with the hardcoded list */
  fileTreeIgnorePatterns: string[];
  /** Wave 26 Phase A — user profiles (built-ins are merged at read time, never stored) */
  profiles?: import('@shared/types/profile').Profile[];
  /** All open project roots for multi-root workspace support (deprecated — use per-window roots) */
  multiRoots: string[];
  /** Per-window session state for restore on relaunch */
  windowSessions: WindowSession[];
  /** Empty string = use shell default PS1 */
  customPrompt: string;
  /** 'default' | 'minimal' | 'powerline' | 'git' | 'custom' */
  promptPreset: string;
  /** Claude CLI launch settings */
  claudeCliSettings: ClaudeCliSettings;
  /** Codex CLI launch settings */
  codexCliSettings: CodexCliSettings;
  agentChatSettings: AgentChatSettings;
  /** Desktop notification preferences for agent events */
  notifications: NotificationSettings;
  /** Pre-configured Claude Code launch profiles */
  agentTemplates: AgentTemplate[];
  /** Saved workspace layouts (panel arrangements) */
  workspaceLayouts: WorkspaceLayout[];
  /** Name of the currently active workspace layout */
  activeLayoutName: string;
  /** Global toggle for the extension system */
  extensionsEnabled: boolean;
  /** Names of extensions that have been explicitly disabled */
  disabledExtensions: string[];
  /** VS Code extensions installed from Open VSX registry */
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
  /** IDs of VSX extensions whose contributions are disabled */
  disabledVsxExtensions: string[];
  /** Whether LSP integration is enabled */
  lspEnabled: boolean;
  /** Whether inline AI completions (ghost text) are enabled */
  inlineCompletionsEnabled: boolean;
  /** Whether semantic codebase search (vector embeddings) is enabled */
  embeddingsEnabled: boolean;
  /** Embedding provider: 'local' (Xenova ONNX) or 'voyage' (Voyage AI API) */
  embeddingProvider: 'local' | 'voyage';
  /** Voyage AI API key (used when embeddingProvider === 'voyage') */
  voyageApiKey: string;
  /** Custom language server commands keyed by language id */
  lspServers: Record<string, string>;
  /** Auto-launch a Claude Code session on startup instead of a plain shell */
  claudeAutoLaunch: boolean;
  /** Tool names that require user approval before execution */
  approvalRequired: string[];
  /** Auto-approve after N seconds (0 = never auto-approve) */
  approvalTimeout: number;
  /** Workspace time-travel snapshots (capped at 100) */
  workspaceSnapshots: WorkspaceSnapshot[];
  /** Terminal cursor style: 'block' | 'underline' | 'bar' */
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  /** Enable Warp-style command block overlay on terminals */
  commandBlocksEnabled: boolean;
  /** Custom regex pattern for prompt detection (heuristic fallback) */
  promptPattern: string;
  /** Format document before saving (requires a formatting provider in Monaco) */
  formatOnSave: boolean;
  /** Context layer settings for AI-assisted codebase understanding */
  contextLayer: ContextLayerConfig;
  /** Automated CLAUDE.md generation settings */
  claudeMdSettings: ClaudeMdSettings;
  /** Configured LLM providers (Anthropic-compatible endpoints) */
  modelProviders: ModelProvider[];
  /** Which provider:model to use for each session type */
  modelSlots: ModelSlotAssignments;
  /** Port for the web remote access server (default: 7890) */
  webAccessPort: number;
  /** Auth token for web remote access */
  webAccessToken: string;
  /** Password for web remote access login (alternative to token) */
  webAccessPassword: string;
  glassOpacity: number;
  /** Model router settings — automatic tier selection (HAIKU/SONNET/OPUS) */
  routerSettings: RouterSettings;
  /** Number of quality signal lines at last retrain — used by retrain trigger. */
  routerLastRetrainCount: number;
  /** Enable the internal MCP server that exposes IDE tools to Claude Code sessions */
  internalMcpEnabled: boolean;
  /** Wave 3B feature flag — route PTY through PtyHost utility process */
  usePtyHost: boolean;
  /** Wave 3B feature flag — route extensions through ExtensionHost utility process */
  useExtensionHost: boolean;
  /** Wave 3B feature flag — run internal MCP server in dedicated McpHost utility process */
  useMcpHost: boolean;
  /** Wave 6 (#116) — token-by-token streaming for Ctrl+K inline edits */
  streamingInlineEdit: boolean;
  /** Wave 6 (#103) — max concurrent background agent jobs (default: 2) */
  backgroundJobsMaxConcurrent: number;
  /** Wave 8 (#115) — persist PTY session descriptors to SQLite for cross-restart restore */
  persistTerminalSessions: boolean;
  /** Workspace trust list — paths approved for hooks, extensions, MCP writes */
  trustedWorkspaces: string[];
  /** Whether to auto-create workspace snapshots at session boundaries */
  autoCheckpoint: boolean;
  /** Whether the user has dismissed the auth onboarding flow */
  authOnboardingDismissed: boolean;
  /** Codebase graph settings (GC, etc.) */
  codebaseGraph: CodebaseGraphSettings;
  /** Wave 15 — structured telemetry feature flag and retention policy */
  telemetry?: { structured?: boolean; retentionDays?: number };
  /** Wave 16 — persisted Session records */
  sessionsData?: Session[];
  /** Wave 16 — session feature flags */
  sessions?: { worktreePerSession?: boolean };
  /** Wave 17/20 — layout preset engine + chat-primary feature flags. Wave 28D — custom layout persistence. Wave 32 — mobilePrimary. */
  layout?: {
    presets?: { v2?: boolean };
    chatPrimary?: boolean;
    dragAndDrop?: boolean;
    /** sessionId → SerializedSlotTree. Capped at 100 entries via LRU pruning. */
    customLayoutsPerSession?: Record<string, import('@shared/types/layout').SerializedSlotTree>;
    /** MRU order of sessionIds for LRU pruning (oldest first). */
    customLayoutsMru?: string[];
    /** User-promoted global custom presets. Capped at 20. */
    globalCustomPresets?: import('@shared/types/layout').SerializedGlobalCustomPreset[];
    /** Wave 32 Phase A — enable mobile-primary layout when viewport < 768px. Default false (soak gate). */
    mobilePrimary?: boolean;
  };
  /** Wave 18 — edit provenance tracking feature flag */
  provenanceTracking?: boolean;
  /** Wave 19 — context scoring feature flags (provenance weights + PageRank) */
  context?: ContextScoringSettings;
  /** Wave 21 Phase D — user-created session folders */
  sessionFolders?: SessionFolder[];
  /** Wave 25 Phase E — always-pinned files per project root: projectRoot → filePaths[] */
  workspaceReadLists?: Record<string, string[]>;
  /** Wave 26 Phase A — per-project default profile: projectRoot → profileId */
  workspaceProfileDefaults?: Record<string, string>;
  /** Wave 26 Phase E — persisted approval memory (allow/deny patterns) */
  approvalMemory?: import('./approvalMemory').ApprovalMemoryStore;
  /** Wave 33a Phase A — mobile client pairing and device registry. */
  mobileAccess?: MobileAccessConfig;
  /** Wave 30 Phase G — research auto-firing global defaults.
   *  Wave 30 Phase I — threshold tuning knobs. */
  researchSettings?: {
    globalEnabled?: boolean;
    defaultMode?: 'off' | 'conservative' | 'aggressive';
    /** Staleness confidence floor (0.0–1.0). Default 0.0 (include all). */
    stalenessConfidenceFloor?: number;
    /** When false, factClaimPauseOrchestrator short-circuits. Default true. */
    factClaimEnabled?: boolean;
    /** Minimum pattern confidence for detectFactClaims. Default 'medium'. */
    factClaimMinPatternConfidence?: 'high' | 'medium' | 'low';
    /** When true, preToolResearchOrchestrator is telemetry-only. Default false. */
    preEditDryRunOnly?: boolean;
    /** Promise.race timeout ms for factClaimPauseOrchestrator. Default 800. */
    maxLatencyMs?: number;
  };
}

export const store = new Store<AppConfig>({
  schema: schema as import('electron-store').Schema<AppConfig>,
});

// In-memory cache to avoid re-reading config.json from disk on every call.
// electron-store's underlying conf library reads the file on every .get().
// This cache is invalidated on every write via setConfigValue.
let configCache: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!configCache) configCache = store.store;
  return configCache;
}

export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  // eslint-disable-next-line security/detect-object-injection -- key is constrained to keyof AppConfig by TypeScript
  return getConfig()[key];
}

export function setConfigValue<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
  store.set(key, value);
  configCache = null; // invalidate cache on write
}
