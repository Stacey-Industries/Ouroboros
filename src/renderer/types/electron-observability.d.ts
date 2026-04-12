import type { IpcResult } from './electron-foundation'

export interface CrashLog {
  name: string
  content: string
  mtime: number
}

export interface CrashLogsResult extends IpcResult {
  logs?: CrashLog[]
}

export interface CrashAPI {
  getCrashLogs: () => Promise<CrashLogsResult>
  clearCrashLogs: () => Promise<IpcResult>
  openCrashLogDir: () => Promise<IpcResult>
  logError: (source: string, message: string, stack?: string) => Promise<IpcResult>
}

export interface MemoryUsage {
  heapUsed: number
  heapTotal: number
  rss: number
  external: number
}

export interface ProcessMetrics {
  pid: number
  type: string
  cpu: { percentCPUUsage: number; idleWakeupsPerSecond: number }
  memory: { workingSetSize: number; peakWorkingSetSize: number }
}

export interface PerfMetrics {
  timestamp: number
  memory: MemoryUsage
  processes: ProcessMetrics[]
}

export interface PerfPingResult extends IpcResult {
  ts?: number
}

export interface PerfAPI {
  ping: () => Promise<PerfPingResult>
  subscribe: () => Promise<IpcResult>
  unsubscribe: () => Promise<IpcResult>
  onMetrics: (callback: (metrics: PerfMetrics) => void) => () => void
}

export interface CostEntry {
  date: string
  sessionId: string
  taskLabel: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  timestamp: number
}

export interface CostHistoryResult extends IpcResult {
  entries?: CostEntry[]
}

export interface CostAPI {
  addEntry: (entry: CostEntry) => Promise<IpcResult>
  getHistory: () => Promise<CostHistoryResult>
  clearHistory: () => Promise<IpcResult>
}

export interface SaveSessionResult extends IpcResult {
  filePath?: string
}

export interface LoadSessionsResult extends IpcResult {
  sessions?: unknown[]
}

export interface ExportSessionResult extends IpcResult {
  filePath?: string
  cancelled?: boolean
}

export interface SessionsAPI {
  save: (session: unknown) => Promise<SaveSessionResult>
  load: () => Promise<LoadSessionsResult>
  delete: (sessionId: string) => Promise<IpcResult>
  export: (session: unknown, format: 'json' | 'markdown') => Promise<ExportSessionResult>
}

export interface SymbolEntry {
  name: string
  type: string
  filePath: string
  relativePath: string
  line: number
}

export interface SymbolSearchResult extends IpcResult {
  symbols?: SymbolEntry[]
}

export interface SymbolGraphNode {
  name: string
  type: string
  filePath: string
  line: number
  endLine?: number
}

export interface SymbolGraphSearchResult extends IpcResult {
  results?: SymbolGraphNode[]
}

export interface SymbolAPI {
  search: (root: string) => Promise<SymbolSearchResult>
  graphSearch: (query: string, projectRoot: string) => Promise<SymbolGraphSearchResult>
}

export interface LspCompletionItem {
  label: string
  kind: string
  detail?: string
  insertText?: string
  documentation?: string
}

export interface LspLocation {
  filePath: string
  line: number
  character: number
}

export interface LspDiagnostic {
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  range: { startLine: number; startChar: number; endLine: number; endChar: number }
}

export type LspServerStatusType = 'starting' | 'running' | 'error' | 'stopped'

export interface LspServerStatus {
  root: string
  language: string
  status: LspServerStatusType
}

export interface LspCompletionResult extends IpcResult {
  items?: LspCompletionItem[]
}

export interface LspHoverResult extends IpcResult {
  contents?: string
}

export interface LspDefinitionResult extends IpcResult {
  location?: LspLocation
}

export interface LspDiagnosticsResult extends IpcResult {
  diagnostics?: LspDiagnostic[]
}

export interface LspStatusResult extends IpcResult {
  servers?: LspServerStatus[]
}

export interface LspAPI {
  start: (root: string, language: string) => Promise<IpcResult>
  stop: (root: string, language: string) => Promise<IpcResult>
  completion: (root: string, filePath: string, line: number, character: number) => Promise<LspCompletionResult>
  hover: (root: string, filePath: string, line: number, character: number) => Promise<LspHoverResult>
  definition: (root: string, filePath: string, line: number, character: number) => Promise<LspDefinitionResult>
  diagnostics: (root: string, filePath: string) => Promise<LspDiagnosticsResult>
  didOpen: (root: string, filePath: string, content: string) => Promise<void>
  didChange: (root: string, filePath: string, content: string) => Promise<void>
  didClose: (root: string, filePath: string) => Promise<void>
  getStatus: () => Promise<LspStatusResult>
  onDiagnostics: (callback: (event: { filePath: string; diagnostics: LspDiagnostic[] }) => void) => () => void
  onStatusChange: (callback: (servers: LspServerStatus[]) => void) => () => void
}

export interface SessionUsage {
  sessionId: string
  startedAt: number
  lastActiveAt: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  messageCount: number
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number
  sessionCount: number
  messageCount: number
}

export interface UsageSummary {
  sessions: SessionUsage[]
  totals: UsageTotals
}

export interface UsageSummaryResult extends IpcResult {
  summary?: UsageSummary
}

export interface SessionMessageUsage {
  timestamp: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface SessionDetail {
  sessionId: string
  messages: SessionMessageUsage[]
  totals: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalTokens: number
    estimatedCost: number
    model: string
    messageCount: number
    durationMs: number
  }
}

export interface SessionDetailResult extends IpcResult {
  detail?: SessionDetail | null
}

export interface RecentSessionsResult extends IpcResult {
  sessions?: SessionDetail[]
}

export interface WindowedUsageBucket {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface WindowedUsage {
  fiveHour: WindowedUsageBucket & { windowStart: number }
  weekly: WindowedUsageBucket & { windowStart: number }
  sonnetFiveHour: WindowedUsageBucket
}

export interface WindowedUsageResult extends IpcResult {
  windowed?: WindowedUsage
}

export interface CodexUsageWindow {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
}

export interface CodexUsageSnapshot {
  capturedAt: number
  planType: string | null
  fiveHour: CodexUsageWindow | null
  weekly: CodexUsageWindow | null
}

export interface ClaudeUsageWindow {
  usedPercent: number
  resetsAt: string | number | null
}

export interface ClaudeUsageSnapshot {
  capturedAt: number
  fiveHour: ClaudeUsageWindow | null
  weekly: ClaudeUsageWindow | null
}

export interface UsageWindowSnapshot {
  fetchedAt: number
  claude: ClaudeUsageSnapshot | null
  codex: CodexUsageSnapshot | null
}

export interface UsageWindowSnapshotResult extends IpcResult {
  snapshot?: UsageWindowSnapshot
}

export interface UsageAPI {
  getSummary: (options?: { projectFilter?: string; since?: number; maxSessions?: number }) => Promise<UsageSummaryResult>
  getSessionDetail: (sessionId: string) => Promise<SessionDetailResult>
  getRecentSessions: (count?: number) => Promise<RecentSessionsResult>
  getWindowedUsage: () => Promise<WindowedUsageResult>
  getUsageWindowSnapshot: () => Promise<UsageWindowSnapshotResult>
}

export interface ContextLayerProgress {
  type: 'idle' | 'summarizing'
  processed: number
  failed: number
  remaining: number
  total: number
  currentModule: string | null
}

export interface ContextLayerAPI {
  onProgress: (callback: (progress: ContextLayerProgress) => void) => () => void
}
