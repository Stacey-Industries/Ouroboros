/**
 * configTypes.ts — All exported interface and type definitions for AppConfig.
 *
 * Extracted from config.ts to keep that file under the ESLint max-lines limit.
 * Re-exported from config.ts so all consumer import paths remain unchanged.
 */


/** Wave 38 Phase A+C — platform-level settings: onboarding, language, update channel, crash reporter, changelog gate.
 *  Phase C adds dismissedEmptyStates for persistent "don't show again" dismiss.
 *  Wave 41 Phase K adds crashReports.allowInsecure (default false). */
export interface PlatformConfig {
  onboarding?: { completed?: boolean };
  language?: 'en' | 'es';
  updateChannel?: 'stable' | 'beta';
  crashReports?: {
    enabled?: boolean;
    webhookUrl?: string;
    /** Wave 41 Phase K — permit http: webhook for debug scenarios (default false). */ allowInsecure?: boolean;
  };
  lastSeenVersion?: string;
  dismissedEmptyStates?: Record<string, boolean>;
}

/** Wave 35 Phase A — per-user theming overrides applied after theme bootstrap. */
export interface ThemingConfig {
  accentOverride?: string;
  verbOverride?: string;
  thinkingVerbs?: string[];
  spinnerChars?: string;
  fonts?: { editor?: string; chat?: string; terminal?: string };
  customTokens?: Record<string, string>;
}

/** Wave 34 Phase A — cross-device session dispatch queue + settings.
 *  Phase F adds optional fcmServiceAccountPath for push delivery. */
export interface SessionDispatchConfig {
  enabled: boolean;
  maxConcurrent: number;
  jobTimeoutMs: number;
  queue: import('./session/sessionDispatch').DispatchJob[];
  fcmServiceAccountPath?: string;
}

/** Wave 33a Phase A — a device that has completed the pairing flow.
 *  Wave 34 Phase F adds pushToken + pushPlatform (server-side only). */
export interface PairedDeviceRecord {
  id: string;
  label: string;
  refreshTokenHash: string;
  fingerprint: string;
  capabilities: string[];
  issuedAt: string;
  lastSeenAt: string;
  /** Wave 34 Phase F — FCM/APNs push token. Never sent to renderer. */
  pushToken?: string;
  pushPlatform?: 'android' | 'ios';
}

/** Wave 33a Phase A — mobileAccess config slice. */
export interface MobileAccessConfig {
  enabled: boolean;
  pairedDevices: PairedDeviceRecord[];
  /** Wave 33a Phase B — stable random desktop install fingerprint for QR MITM detection. */
  desktopFingerprint?: string;
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
  /** Use long-lived warm process for multi-turn cache reuse (default: true) */
  useWarmProcess: boolean;
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

export interface AppLayoutConfig {
  presets?: { v2?: boolean };
  dragAndDrop?: boolean;
  customLayoutsPerSession?: Record<string, import('@shared/types/layout').SerializedSlotTree>;
  customLayoutsMru?: string[];
  globalCustomPresets?: import('@shared/types/layout').SerializedGlobalCustomPreset[];
  mobilePrimary?: boolean;
  immersiveChat?: boolean;
  chatWorkbench?: boolean;
}

export interface AppEcosystemConfig {
  lastSeenSnapshot?: import('./promptDiff').PromptDiffSnapshot;
  lastExport?: { path: string; at: number; rows: number };
  systemPrompt?: string;
  rulesAndSkillsInstallEnabled?: boolean;
  codexAppServerTransport?: boolean;
}

export interface ResearchSettings {
  globalEnabled?: boolean;
  defaultMode?: 'off' | 'conservative' | 'aggressive';
  stalenessConfidenceFloor?: number;
  factClaimEnabled?: boolean;
  factClaimMinPatternConfidence?: 'high' | 'medium' | 'low';
  preEditDryRunOnly?: boolean;
  maxLatencyMs?: number;
}

export interface InstalledVsxExtension {
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
}

export type { AppConfig } from './configAppTypes';
