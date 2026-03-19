import type {
  ContextPacketResult,
  OrchestrationState,
  ProviderProgressEvent,
  TaskMutationResult,
  TaskRequest,
  TaskSessionPatch,
  TaskSessionRecord,
  TaskSessionResult,
  TaskSessionsResult,
  VerificationProfileName,
  VerificationResult,
  VerificationSummary,
} from '../../main/orchestration/types'
import type { AgentChatAPI } from './electron-agent-chat'
import type { ClaudeMdAPI } from './electron-claude-md'
import type { ExtensionStoreAPI } from './electron-extension-store'
import type { ExtensionsAPI, IpcResult } from './electron-foundation'
import type { GitAPI, ShellHistoryAPI, UpdaterAPI } from './electron-git'
import type { McpStoreAPI } from './electron-mcp-store'
import type {
  ContextLayerAPI,
  CostAPI,
  CrashAPI,
  LspAPI,
  PerfAPI,
  SessionsAPI,
  SymbolAPI,
  UsageAPI
} from './electron-observability'
import type {
  AppAPI,
  ApprovalAPI,
  ConfigAPI,
  FilesAPI,
  HooksAPI,
  PtyAPI,
  ShellAPI,
  ThemeAPI
} from './electron-runtime-apis'

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface McpServerEntry {
  name: string
  config: McpServerConfig
  scope: 'global' | 'project'
  enabled: boolean
}

export interface McpGetServersResult extends IpcResult {
  servers?: McpServerEntry[]
}

export interface McpAPI {
  getServers: (projectRoot?: string) => Promise<McpGetServersResult>
  addServer: (name: string, config: McpServerConfig, scope: 'global' | 'project', projectRoot?: string) => Promise<IpcResult>
  removeServer: (name: string, scope: 'global' | 'project', projectRoot?: string) => Promise<IpcResult>
  updateServer: (name: string, config: McpServerConfig, scope: 'global' | 'project', projectRoot?: string) => Promise<IpcResult>
  toggleServer: (name: string, enabled: boolean, scope: 'global' | 'project', projectRoot?: string) => Promise<IpcResult>
}

export interface ProjectContext {
  name: string
  language: string
  framework: string | null
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'cargo' | 'pip' | 'go' | 'bun' | null
  entryPoints: string[]
  keyDirs: Array<{ path: string; purpose: string }>
  keyConfigs: string[]
  testFramework: string | null
  buildCommands: Array<{ name: string; command: string }>
  dependencies: Array<{ name: string; version: string }>
  hasClaudeMd: boolean
  detectedPatterns: string[]
}

export interface ContextGenerateOptions {
  includeCommands?: boolean
  includeDeps?: boolean
  includeStructure?: boolean
  maxDeps?: number
}

export interface ContextScanResult extends IpcResult {
  context?: ProjectContext
}

export interface ContextGenerateResult extends IpcResult {
  content?: string
  context?: ProjectContext
}

export interface ContextAPI {
  scan: (projectRoot: string) => Promise<ContextScanResult>
  generate: (projectRoot: string, options?: ContextGenerateOptions) => Promise<ContextGenerateResult>
}

export interface IdeToolQuery {
  queryId: string
  method: string
  params?: unknown
}

export interface IdeToolsAPI {
  respond: (queryId: string, result: unknown, error?: string) => Promise<IpcResult>
  onQuery: (callback: (query: IdeToolQuery) => void) => () => void
  getAddress: () => Promise<{ address: string | null }>
}

export interface CodeModeStatusResult extends IpcResult {
  enabled?: boolean
  proxiedServers?: string[]
  generatedTypes?: string
}

export interface CodeModeAPI {
  enable: (serverNames: string[], scope: 'global' | 'project', projectRoot?: string) => Promise<IpcResult>
  disable: () => Promise<IpcResult>
  getStatus: () => Promise<CodeModeStatusResult>
}

export interface WindowInfo {
  id: number
  projectRoot: string | null
}

export interface WindowListResult extends IpcResult {
  windows?: WindowInfo[]
}

export interface WindowNewResult extends IpcResult {
  windowId?: number
}

export interface WindowAPI {
  create: (projectRoot?: string) => Promise<WindowNewResult>
  list: () => Promise<WindowListResult>
  focus: (windowId: number) => Promise<IpcResult>
  close: (windowId: number) => Promise<IpcResult>
}

/**
 * Minimal orchestration API — only methods still used by the chat bridge.
 * The full task management UI and API were removed as dead code.
 */
export interface OrchestrationAPI {
  createTask: (request: TaskRequest) => Promise<TaskMutationResult>
  startTask: (taskId: string) => Promise<TaskMutationResult>
  previewContext: (request: TaskRequest) => Promise<ContextPacketResult>
  buildContextPacket: (request: TaskRequest) => Promise<ContextPacketResult>
  loadSession: (sessionId: string) => Promise<TaskSessionResult>
  loadSessions: (workspaceRoot?: string) => Promise<TaskSessionsResult>
  loadLatestSession: (workspaceRoot?: string) => Promise<TaskSessionResult>
  updateSession: (sessionId: string, patch: TaskSessionPatch) => Promise<TaskSessionResult>
  resumeTask: (sessionId: string) => Promise<TaskMutationResult>
  rerunVerification: (sessionId: string, profile?: VerificationProfileName) => Promise<VerificationResult>
  cancelTask: (taskId: string) => Promise<TaskMutationResult>
  pauseTask: (taskId: string) => Promise<TaskMutationResult>
  onStateChange: (callback: (state: OrchestrationState) => void) => () => void
  onProviderEvent: (callback: (event: ProviderProgressEvent) => void) => () => void
  onVerificationSummary: (callback: (summary: VerificationSummary) => void) => () => void
  onSessionUpdate: (callback: (session: TaskSessionRecord) => void) => () => void
}

export interface ElectronAPI {
  pty: PtyAPI
  config: ConfigAPI
  files: FilesAPI
  hooks: HooksAPI
  approval: ApprovalAPI
  app: AppAPI
  shell: ShellAPI
  theme: ThemeAPI
  git: GitAPI
  sessions: SessionsAPI
  cost: CostAPI
  usage: UsageAPI
  shellHistory: ShellHistoryAPI
  updater: UpdaterAPI
  crash: CrashAPI
  perf: PerfAPI
  symbol: SymbolAPI
  lsp: LspAPI
  window: WindowAPI
  extensions: ExtensionsAPI
  mcp: McpAPI
  mcpStore: McpStoreAPI
  extensionStore: ExtensionStoreAPI
  context: ContextAPI
  ideTools: IdeToolsAPI
  codemode: CodeModeAPI
  agentChat: AgentChatAPI
  orchestration: OrchestrationAPI
  contextLayer: ContextLayerAPI
  claudeMd: ClaudeMdAPI
}
