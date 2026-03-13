/**
 * useSessionAnalytics.ts — Computes performance analytics from AgentSession data.
 *
 * Derives token efficiency, retry rates, tool distribution, error rates,
 * and session duration metrics from the agent events context.
 */

import { useMemo } from 'react';
import type { AgentSession, ToolCallEvent } from '../components/AgentMonitor/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolDistributionEntry {
  toolName: string;
  count: number;
  percentage: number;
  errorCount: number;
}

export interface SessionMetrics {
  sessionId: string;
  taskLabel: string;
  status: string;
  durationMs: number;
  toolCallCount: number;
  fileEditCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  errorCount: number;
  retryCount: number;
  /** Tokens per file edit (lower = more efficient). Infinity if no edits. */
  efficiencyScore: number;
  model?: string;
  startedAt: number;
  completedAt?: number;
  toolCalls: ToolCallEvent[];
  /** Map of file path -> edit count for this session */
  fileEditCounts: Record<string, number>;
}

export interface AggregateMetrics {
  totalSessions: number;
  avgTokensPerEdit: number;
  avgRetryRate: number;
  errorRate: number;
  avgDurationMs: number;
  totalToolCalls: number;
  totalFileEdits: number;
  totalErrors: number;
}

export interface SessionAnalytics {
  sessions: SessionMetrics[];
  aggregate: AggregateMetrics;
  toolDistribution: ToolDistributionEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const FILE_EDIT_TOOLS = new Set(['Edit', 'Write']);

/**
 * Extract a file path from the tool call input summary string.
 * The input field is a truncated summary, so we try to extract what looks like a path.
 */
function extractFilePath(input: string): string | null {
  if (!input) return null;
  // The input is typically a file path or command summary
  const trimmed = input.trim();
  // If it looks like a path (contains / or \), use it
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    // Take the first path-like segment
    const match = trimmed.match(/[^\s"']+[/\\][^\s"']*/);
    return match ? match[0] : trimmed;
  }
  return trimmed;
}

function computeSessionMetrics(session: AgentSession): SessionMetrics {
  const durationMs = session.completedAt
    ? session.completedAt - session.startedAt
    : Date.now() - session.startedAt;

  const toolCallCount = session.toolCalls.length;
  const totalTokens = session.inputTokens + session.outputTokens;

  // Count file edits and track per-file edit counts
  const fileEditCounts: Record<string, number> = {};
  let errorCount = 0;

  for (const tc of session.toolCalls) {
    if (tc.status === 'error') errorCount++;

    if (FILE_EDIT_TOOLS.has(tc.toolName)) {
      const filePath = extractFilePath(tc.input);
      if (filePath) {
        fileEditCounts[filePath] = (fileEditCounts[filePath] || 0) + 1;
      }
    }
  }

  const fileEditCount = Object.keys(fileEditCounts).length > 0
    ? Object.values(fileEditCounts).reduce((sum, c) => sum + c, 0)
    : 0;

  // Retry count: files edited 3+ times indicate retries
  const retryCount = Object.values(fileEditCounts)
    .filter((count) => count >= 3)
    .reduce((sum, count) => sum + (count - 2), 0);

  const efficiencyScore = fileEditCount > 0 ? totalTokens / fileEditCount : Infinity;

  return {
    sessionId: session.id,
    taskLabel: session.taskLabel,
    status: session.status,
    durationMs,
    toolCallCount,
    fileEditCount,
    totalTokens,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    errorCount,
    retryCount,
    efficiencyScore,
    model: session.model,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    toolCalls: session.toolCalls,
    fileEditCounts,
  };
}

function computeToolDistribution(sessions: AgentSession[]): ToolDistributionEntry[] {
  const counts = new Map<string, { count: number; errors: number }>();

  for (const session of sessions) {
    for (const tc of session.toolCalls) {
      const entry = counts.get(tc.toolName) ?? { count: 0, errors: 0 };
      entry.count++;
      if (tc.status === 'error') entry.errors++;
      counts.set(tc.toolName, entry);
    }
  }

  const total = Array.from(counts.values()).reduce((s, e) => s + e.count, 0);
  if (total === 0) return [];

  return Array.from(counts.entries())
    .map(([toolName, { count, errors }]) => ({
      toolName,
      count,
      percentage: (count / total) * 100,
      errorCount: errors,
    }))
    .sort((a, b) => b.count - a.count);
}

function computeAggregate(sessionMetrics: SessionMetrics[]): AggregateMetrics {
  const totalSessions = sessionMetrics.length;
  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      avgTokensPerEdit: 0,
      avgRetryRate: 0,
      errorRate: 0,
      avgDurationMs: 0,
      totalToolCalls: 0,
      totalFileEdits: 0,
      totalErrors: 0,
    };
  }

  const totalToolCalls = sessionMetrics.reduce((s, m) => s + m.toolCallCount, 0);
  const totalFileEdits = sessionMetrics.reduce((s, m) => s + m.fileEditCount, 0);
  const totalErrors = sessionMetrics.reduce((s, m) => s + m.errorCount, 0);
  const totalTokens = sessionMetrics.reduce((s, m) => s + m.totalTokens, 0);
  const totalRetries = sessionMetrics.reduce((s, m) => s + m.retryCount, 0);
  const totalDuration = sessionMetrics.reduce((s, m) => s + m.durationMs, 0);

  return {
    totalSessions,
    avgTokensPerEdit: totalFileEdits > 0 ? totalTokens / totalFileEdits : 0,
    avgRetryRate: totalFileEdits > 0 ? (totalRetries / totalFileEdits) * 100 : 0,
    errorRate: totalToolCalls > 0 ? (totalErrors / totalToolCalls) * 100 : 0,
    avgDurationMs: totalDuration / totalSessions,
    totalToolCalls,
    totalFileEdits,
    totalErrors,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSessionAnalytics(agents: AgentSession[]): SessionAnalytics {
  return useMemo(() => {
    const sessionMetrics = agents.map(computeSessionMetrics);
    const aggregate = computeAggregate(sessionMetrics);
    const toolDistribution = computeToolDistribution(agents);

    return { sessions: sessionMetrics, aggregate, toolDistribution };
  }, [agents]);
}
