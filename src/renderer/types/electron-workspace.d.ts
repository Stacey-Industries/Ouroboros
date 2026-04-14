import type { AgentChatAPI } from './electron-agent-chat';
import type { AgentConflictAPI } from './electron-agent-conflict';
import type { AiAPI } from './electron-ai';
import type { AiStreamAPI } from './electron-ai-stream';
import type { AuthAPI } from './electron-auth';
import type { BackgroundJobsAPI } from './electron-background-jobs';
import type { CheckpointAPI } from './electron-checkpoint';
import type { ClaudeMdAPI } from './electron-claude-md';
import type { EmbeddingAPI } from './electron-embedding';
import type { ExtensionStoreAPI } from './electron-extension-store';
import type { ExtensionsAPI } from './electron-extensions';
import type { IpcResult, ModelProvider, ModelSlotAssignments } from './electron-foundation';
import type { GitAPI, ShellHistoryAPI, UpdaterAPI } from './electron-git';
import type { McpStoreAPI } from './electron-mcp-store';
import type {
  ContextLayerAPI,
  CostAPI,
  CrashAPI,
  LspAPI,
  PerfAPI,
  SessionsAPI,
  SymbolAPI,
  UsageAPI,
} from './electron-observability';
import type { OrchestrationAPI } from './electron-orchestration';
import type { RulesAndSkillsAPI } from './electron-rules-skills';
import type {
  AppAPI,
  ApprovalAPI,
  CodexAPI,
  ConfigAPI,
  FilesAPI,
  HooksAPI,
  PtyAPI,
  ShellAPI,
  ThemeAPI,
} from './electron-runtime-apis';
import type { SpecAPI } from './electron-spec';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  scope: 'global' | 'project';
  enabled: boolean;
}

export interface McpGetServersResult extends IpcResult {
  servers?: McpServerEntry[];
}

export interface McpAPI {
  getServers: (projectRoot?: string) => Promise<McpGetServersResult>;
  addServer: (
    name: string,
    config: McpServerConfig,
    scope: 'global' | 'project',
    projectRoot?: string,
  ) => Promise<IpcResult>;
  removeServer: (
    name: string,
    scope: 'global' | 'project',
    projectRoot?: string,
  ) => Promise<IpcResult>;
  updateServer: (
    name: string,
    config: McpServerConfig,
    scope: 'global' | 'project',
    projectRoot?: string,
  ) => Promise<IpcResult>;
  toggleServer: (
    name: string,
    enabled: boolean,
    scope: 'global' | 'project',
    projectRoot?: string,
  ) => Promise<IpcResult>;
}

export interface ProjectContext {
  name: string;
  language: string;
  framework: string | null;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'cargo' | 'pip' | 'go' | 'bun' | null;
  entryPoints: string[];
  keyDirs: Array<{ path: string; purpose: string }>;
  keyConfigs: string[];
  testFramework: string | null;
  buildCommands: Array<{ name: string; command: string }>;
  dependencies: Array<{ name: string; version: string }>;
  hasClaudeMd: boolean;
  detectedPatterns: string[];
}

export interface ContextGenerateOptions {
  includeCommands?: boolean;
  includeDeps?: boolean;
  includeStructure?: boolean;
  maxDeps?: number;
}

export interface ContextScanResult extends IpcResult {
  context?: ProjectContext;
}

export interface ContextGenerateResult extends IpcResult {
  content?: string;
  context?: ProjectContext;
}

export interface ContextAPI {
  scan: (projectRoot: string) => Promise<ContextScanResult>;
  generate: (
    projectRoot: string,
    options?: ContextGenerateOptions,
  ) => Promise<ContextGenerateResult>;
}

export interface IdeToolQuery {
  queryId: string;
  method: string;
  params?: unknown;
}

export interface IdeToolsAPI {
  respond: (queryId: string, result: unknown, error?: string) => Promise<IpcResult>;
  onQuery: (callback: (query: IdeToolQuery) => void) => () => void;
  getAddress: () => Promise<{ address: string | null }>;
}

export interface CodeModeStatusResult extends IpcResult {
  enabled?: boolean;
  proxiedServers?: string[];
  generatedTypes?: string;
}

export interface CodeModeAPI {
  enable: (
    serverNames: string[],
    scope: 'global' | 'project',
    projectRoot?: string,
  ) => Promise<IpcResult>;
  disable: () => Promise<IpcResult>;
  getStatus: () => Promise<CodeModeStatusResult>;
}

export interface WindowInfo {
  id: number;
  projectRoot: string | null;
  projectRoots: string[];
}

export interface WindowProjectRootsResult extends IpcResult {
  roots?: string[];
}

export interface WindowListResult extends IpcResult {
  windows?: WindowInfo[];
}

export interface WindowNewResult extends IpcResult {
  windowId?: number;
}

export interface WindowSelfResult extends IpcResult {
  windowId?: number;
  projectRoot?: string | null;
}

export interface WindowAPI {
  create: (projectRoot?: string) => Promise<WindowNewResult>;
  list: () => Promise<WindowListResult>;
  focus: (windowId: number) => Promise<IpcResult>;
  close: (windowId: number) => Promise<IpcResult>;
  getSelf: () => Promise<WindowSelfResult>;
  setProjectRoot: (projectRoot: string) => Promise<IpcResult>;
  getProjectRoots: () => Promise<WindowProjectRootsResult>;
  setProjectRoots: (roots: string[]) => Promise<IpcResult>;
}

export type { OrchestrationAPI };

export interface ProvidersAPI {
  list: () => Promise<ModelProvider[]>;
  getSlots: () => Promise<ModelSlotAssignments>;
}

/* ── Layout types (moved from electron-foundation for max-lines) ──── */

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

/* ── Router analytics ─────────────────────────────────────────────── */

export interface RouterStatsResult {
  tierDistribution: { HAIKU: number; SONNET: number; OPUS: number };
  bySurface: {
    chat: { HAIKU: number; SONNET: number; OPUS: number };
    terminal_shadow: { HAIKU: number; SONNET: number; OPUS: number };
    agentic: { HAIKU: number; SONNET: number; OPUS: number };
  };
  overrideRate: number;
  overrideDirection: { upgradeCount: number; downgradeCount: number };
  layerDistribution: { rule: number; classifier: number; llm: number; default_: number };
  totalDecisions: number;
  signalCounts: Record<string, number>;
}

export interface RouterAPI {
  getStats(): Promise<IpcResult & { data?: RouterStatsResult }>;
}

export interface ElectronAPI {
  pty: PtyAPI;
  config: ConfigAPI;
  files: FilesAPI;
  hooks: HooksAPI;
  approval: ApprovalAPI;
  auth: AuthAPI;
  app: AppAPI;
  shell: ShellAPI;
  theme: ThemeAPI;
  git: GitAPI;
  sessions: SessionsAPI;
  cost: CostAPI;
  usage: UsageAPI;
  shellHistory: ShellHistoryAPI;
  updater: UpdaterAPI;
  crash: CrashAPI;
  perf: PerfAPI;
  symbol: SymbolAPI;
  lsp: LspAPI;
  window: WindowAPI;
  extensions: ExtensionsAPI;
  mcp: McpAPI;
  mcpStore: McpStoreAPI;
  extensionStore: ExtensionStoreAPI;
  context: ContextAPI;
  ideTools: IdeToolsAPI;
  codemode: CodeModeAPI;
  agentChat: AgentChatAPI;
  orchestration: OrchestrationAPI;
  contextLayer: ContextLayerAPI;
  claudeMd: ClaudeMdAPI;
  providers: ProvidersAPI;
  codex: CodexAPI;
  router: RouterAPI;
  rulesAndSkills: RulesAndSkillsAPI;
  ai: AiAPI;
  aiStream: AiStreamAPI;
  embedding: EmbeddingAPI;
  workspace: WorkspaceAPI;
  backgroundJobs: BackgroundJobsAPI;
  agentConflict: AgentConflictAPI;
  checkpoint: CheckpointAPI;
  spec: SpecAPI;
}

export interface WorkspaceAPI {
  isTrusted(path: string): Promise<boolean>;
  trustLevel(roots: string[]): Promise<'trusted' | 'restricted'>;
  trust(path: string): Promise<IpcResult>;
  untrust(path: string): Promise<IpcResult>;
}
