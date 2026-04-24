import type { IpcResult } from './electron-foundation';

export interface CrashLog {
  name: string;
  content: string;
  mtime: number;
}

export interface CrashLogsResult extends IpcResult {
  logs?: CrashLog[];
}

export interface CrashAPI {
  getCrashLogs: () => Promise<CrashLogsResult>;
  clearCrashLogs: () => Promise<IpcResult>;
  openCrashLogDir: () => Promise<IpcResult>;
  openCrashReportsDir: () => Promise<IpcResult>;
  logError: (source: string, message: string, stack?: string) => Promise<IpcResult>;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

export interface ProcessMetrics {
  pid: number;
  type: string;
  cpu: { percentCPUUsage: number; idleWakeupsPerSecond: number };
  memory: { workingSetSize: number; peakWorkingSetSize: number };
}

export interface PerfMetrics {
  timestamp: number;
  memory: MemoryUsage;
  processes: ProcessMetrics[];
}

export interface PerfPingResult extends IpcResult {
  ts?: number;
}

/**
 * A single startup timing mark emitted by the main process.
 * tsNs is the raw nanosecond timestamp from process.hrtime.bigint(),
 * serialized as a string because bigint does not survive JSON serialization
 * over IPC (structured-clone drops it). Parse with BigInt(tsNs) if needed.
 */
export interface StartupMark {
  phase:
    | 'app-ready'
    | 'window-ready'
    | 'ipc-ready'
    | 'services-ready'
    | 'renderer-bundle-loaded'
    | 'react-root-created'
    | 'first-render';
  tsNs: string;
  deltaMs: number;
}

export interface StartupTimingsResult extends IpcResult {
  timings?: StartupMark[];
}

/** Point-in-time snapshot of runtime resource usage. */
export interface RuntimeMetrics {
  tsMs: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  cpuPercent?: number;
}

export interface RuntimeMetricsResult extends IpcResult {
  metrics?: RuntimeMetrics | null;
}

/**
 * A single timing mark from a persisted startup record.
 * Mirrors SerializedMark in perfStartupLog.ts (main-side private type).
 */
export interface StartupHistoryMark {
  phase: StartupMark['phase'];
  tsNs: string;
  deltaMs: number;
}

/**
 * One entry in the startup-timings.jsonl history log.
 * Returned by perf:getStartupHistory.
 */
export interface StartupHistoryRecord {
  ts: string;
  timings: StartupHistoryMark[];
  platform: string;
  version: string;
}

export interface StartupHistoryResult extends IpcResult {
  records?: StartupHistoryRecord[];
}

export interface PerfAPI {
  ping: () => Promise<PerfPingResult>;
  subscribe: () => Promise<IpcResult>;
  unsubscribe: () => Promise<IpcResult>;
  onMetrics: (callback: (metrics: PerfMetrics) => void) => () => void;
  mark: (phase: StartupMark['phase']) => Promise<IpcResult>;
  markFirstRender: () => Promise<IpcResult>;
  getStartupTimings: () => Promise<StartupTimingsResult>;
  getRuntimeMetrics: () => Promise<RuntimeMetricsResult>;
  getStartupHistory: (limit?: number) => Promise<StartupHistoryResult>;
}

export interface CostEntry {
  date: string;
  sessionId: string;
  taskLabel: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  timestamp: number;
}

export interface CostHistoryResult extends IpcResult {
  entries?: CostEntry[];
}

export interface CostAPI {
  addEntry: (entry: CostEntry) => Promise<IpcResult>;
  getHistory: () => Promise<CostHistoryResult>;
  clearHistory: () => Promise<IpcResult>;
}

// SessionsAPI and its result types (SaveSessionResult, LoadSessionsResult,
// ExportSessionResult) live in electron-dispatch.d.ts alongside the Wave 34
// dispatch types they now depend on. Re-exported via the electron.d.ts barrel.

export interface SymbolEntry {
  name: string;
  type: string;
  filePath: string;
  relativePath: string;
  line: number;
}

export interface SymbolSearchResult extends IpcResult {
  symbols?: SymbolEntry[];
}

export interface SymbolAPI {
  search: (root: string) => Promise<SymbolSearchResult>;
}

export interface LspCompletionItem {
  label: string;
  kind: string;
  detail?: string;
  insertText?: string;
  documentation?: string;
}

export interface LspLocation {
  filePath: string;
  line: number;
  character: number;
}

export interface LspDiagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  range: { startLine: number; startChar: number; endLine: number; endChar: number };
}

export type LspServerStatusType = 'starting' | 'running' | 'error' | 'stopped';

export interface LspServerStatus {
  root: string;
  language: string;
  status: LspServerStatusType;
}

export interface LspCompletionResult extends IpcResult {
  items?: LspCompletionItem[];
}

export interface LspHoverResult extends IpcResult {
  contents?: string;
}

export interface LspDefinitionResult extends IpcResult {
  location?: LspLocation;
}

export interface LspDiagnosticsResult extends IpcResult {
  diagnostics?: LspDiagnostic[];
}

export interface LspStatusResult extends IpcResult {
  servers?: LspServerStatus[];
}

export interface LspAPI {
  start: (root: string, language: string) => Promise<IpcResult>;
  stop: (root: string, language: string) => Promise<IpcResult>;
  completion: (
    root: string,
    filePath: string,
    line: number,
    character: number,
  ) => Promise<LspCompletionResult>;
  hover: (
    root: string,
    filePath: string,
    line: number,
    character: number,
  ) => Promise<LspHoverResult>;
  definition: (
    root: string,
    filePath: string,
    line: number,
    character: number,
  ) => Promise<LspDefinitionResult>;
  diagnostics: (root: string, filePath: string) => Promise<LspDiagnosticsResult>;
  didOpen: (root: string, filePath: string, content: string) => Promise<void>;
  didChange: (root: string, filePath: string, content: string) => Promise<void>;
  didClose: (root: string, filePath: string) => Promise<void>;
  getStatus: () => Promise<LspStatusResult>;
  onDiagnostics: (
    callback: (event: { filePath: string; diagnostics: LspDiagnostic[] }) => void,
  ) => () => void;
  onStatusChange: (callback: (servers: LspServerStatus[]) => void) => () => void;
}

export type {
  ClaudeUsageSnapshot,
  ClaudeUsageWindow,
  CodexUsageSnapshot,
  CodexUsageWindow,
  RecentSessionsResult,
  SessionDetail,
  SessionDetailResult,
  SessionMessageUsage,
  SessionUsage,
  UsageAPI,
  UsageSummary,
  UsageSummaryResult,
  UsageTotals,
  UsageWindowSnapshot,
  UsageWindowSnapshotResult,
  WindowedUsage,
  WindowedUsageBucket,
  WindowedUsageResult,
} from './electron-usage';

export interface ContextLayerProgress {
  type: 'idle' | 'summarizing';
  processed: number;
  failed: number;
  remaining: number;
  total: number;
  currentModule: string | null;
}

export interface ContextLayerAPI {
  onProgress: (callback: (progress: ContextLayerProgress) => void) => () => void;
}
