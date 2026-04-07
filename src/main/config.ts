import Store from 'electron-store';

import type { AgentChatSettings } from './agentChat/types';
import { schema } from './configSchema';
import type { ContextLayerConfig } from './contextLayer/contextLayerTypes';

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
  profiles: Record<string, Partial<Omit<AppConfig, 'profiles'>>>;
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
