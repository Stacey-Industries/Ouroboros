/**
 * configAppTypes.ts — AppConfig interface definition.
 *
 * Extracted from configTypes.ts to keep that file under the ESLint max-lines
 * limit. Re-exported from configTypes.ts and config.ts so all consumer import
 * paths remain unchanged.
 */

import type { AgentChatSettings } from './agentChat/types';
import type {
  AgentTemplate,
  AppEcosystemConfig,
  AppLayoutConfig,
  ClaudeCliSettings,
  ClaudeMdSettings,
  CodebaseGraphSettings,
  CodexCliSettings,
  ContextScoringSettings,
  InstalledVsxExtension,
  MobileAccessConfig,
  ModelProvider,
  ModelSlotAssignments,
  NotificationSettings,
  PanelSizes,
  PlatformConfig,
  ResearchSettings,
  RouterSettings,
  SessionDispatchConfig,
  TerminalSessionSnapshot,
  ThemingConfig,
  WindowBounds,
  WindowSession,
  WorkspaceLayout,
  WorkspaceSnapshot,
} from './configTypes';
import type { ContextLayerConfig } from './contextLayer/contextLayerTypes';
import type { Session } from './session';
import type { SessionFolder } from './session/folderStore';

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
  /**
   * @deprecated Wave 40 Phase D — write path removed; canonical store is sessionsData.
   * Retained for config-validation tolerance. Remove next cleanup wave.
   */
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
  installedVsxExtensions: InstalledVsxExtension[];
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
  /** Wave 45 — material variant (Vapor / Prism / Warp) for the shell. */
  materialVariant: 'vapor' | 'prism' | 'warp';
  /** Model router settings — automatic tier selection (HAIKU/SONNET/OPUS) */
  routerSettings: RouterSettings;
  /** Number of quality signal lines at last retrain — used by retrain trigger. */
  routerLastRetrainCount: number;
  /** Enable the internal MCP server that exposes IDE tools to Claude Code sessions */
  internalMcpEnabled: boolean;
  /** Wave 48 Phase B — when to inject the Ouroboros MCP entry. Default 'task-gated'. */
  internalMcpScope?: 'always' | 'task-gated' | 'never';
  /** Wave 3B feature flag — route PTY through PtyHost utility process */
  usePtyHost: boolean;
  /** Wave 3B feature flag — route extensions through ExtensionHost utility process */
  useExtensionHost: boolean;
  /** Wave 3B feature flag — run internal MCP server in dedicated McpHost utility process */
  useMcpHost: boolean;
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
  /** Wave 15 / Wave 53 — structured telemetry feature flag and retention policy */
  telemetry?: { structured?: boolean; remote?: boolean; retentionDays?: number };
  /** Wave 16 — persisted Session records */
  sessionsData?: Session[];
  /** Wave 16 — session feature flags */
  sessions?: { worktreePerSession?: boolean };
  /** Wave 17 — layout preset engine. Wave 28D — custom layout persistence. Wave 32+ — mobilePrimary, immersiveChat, chatWorkbench. */
  layout?: AppLayoutConfig;
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
  /** Wave 34 Phase A — cross-device session dispatch queue + settings. */
  sessionDispatch?: SessionDispatchConfig;
  /** Wave 35 Phase A — per-user theming overrides applied after theme bootstrap. */
  theming?: ThemingConfig;
  /** Wave 36 Phase A — gates whether profile picker surfaces non-Claude session providers. */
  providers?: { multiProvider?: boolean };
  /** Wave 37 — ecosystem moat: prompt-diff snapshot, usage export, marketplace bundle, rules-and-skills. */
  ecosystem?: AppEcosystemConfig;
  /** Wave 38 Phase A — platform-level settings: onboarding gate, language, update channel, crash reporter. */
  platform?: PlatformConfig;
  /** Wave 41 Phase C — marketplace behaviour flags. */
  marketplace?: { allowInstallOnRevocationFetchFailure?: boolean };
  /** Wave 30 Phase G+I — research auto-firing global defaults + threshold tuning knobs. */
  researchSettings?: ResearchSettings;
}
