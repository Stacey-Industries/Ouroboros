import type { IpcResult } from './electron-foundation';

export interface SessionUsage {
  sessionId: string;
  startedAt: number;
  lastActiveAt: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  messageCount: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  sessionCount: number;
  messageCount: number;
}

export interface UsageSummary {
  sessions: SessionUsage[];
  totals: UsageTotals;
}

export interface UsageSummaryResult extends IpcResult {
  summary?: UsageSummary;
}

export interface SessionMessageUsage {
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SessionDetail {
  sessionId: string;
  messages: SessionMessageUsage[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    estimatedCost: number;
    model: string;
    messageCount: number;
    durationMs: number;
  };
}

export interface SessionDetailResult extends IpcResult {
  detail?: SessionDetail | null;
}

export interface RecentSessionsResult extends IpcResult {
  sessions?: SessionDetail[];
}

export interface WindowedUsageBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface WindowedUsage {
  fiveHour: WindowedUsageBucket & { windowStart: number };
  weekly: WindowedUsageBucket & { windowStart: number };
  sonnetFiveHour: WindowedUsageBucket;
}

export interface WindowedUsageResult extends IpcResult {
  windowed?: WindowedUsage;
}

export interface CodexUsageWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number | null;
}

export interface CodexUsageSnapshot {
  capturedAt: number;
  planType: string | null;
  fiveHour: CodexUsageWindow | null;
  weekly: CodexUsageWindow | null;
}

export interface ClaudeUsageWindow {
  usedPercent: number;
  resetsAt: string | number | null;
}

export interface ClaudeUsageSnapshot {
  capturedAt: number;
  fiveHour: ClaudeUsageWindow | null;
  weekly: ClaudeUsageWindow | null;
}

export interface UsageWindowSnapshot {
  fetchedAt: number;
  claude: ClaudeUsageSnapshot | null;
  codex: CodexUsageSnapshot | null;
}

export interface UsageWindowSnapshotResult extends IpcResult {
  snapshot?: UsageWindowSnapshot;
}

export interface UsageAPI {
  getSummary: (options?: {
    projectFilter?: string;
    since?: number;
    maxSessions?: number;
  }) => Promise<UsageSummaryResult>;
  getSessionDetail: (sessionId: string) => Promise<SessionDetailResult>;
  getRecentSessions: (count?: number) => Promise<RecentSessionsResult>;
  getWindowedUsage: () => Promise<WindowedUsageResult>;
  getUsageWindowSnapshot: () => Promise<UsageWindowSnapshotResult>;
}
