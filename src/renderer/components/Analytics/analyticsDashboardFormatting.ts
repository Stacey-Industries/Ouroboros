import type { ToolCallEvent } from '../AgentMonitor/types';
import type { SessionMetrics } from '../../hooks/useSessionAnalytics';

export type SortKey =
  | 'startedAt'
  | 'durationMs'
  | 'toolCallCount'
  | 'fileEditCount'
  | 'totalTokens'
  | 'efficiencyScore'
  | 'errorCount';

export const SESSION_COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'startedAt', label: 'When', width: '56px' },
  { key: 'durationMs', label: 'Duration', width: '48px' },
  { key: 'toolCallCount', label: 'Tools', width: '36px' },
  { key: 'fileEditCount', label: 'Edits', width: '36px' },
  { key: 'totalTokens', label: 'Tokens', width: '48px' },
  { key: 'efficiencyScore', label: 'Eff.', width: '44px' },
  { key: 'errorCount', label: 'Errs', width: '28px' },
];

const TOOL_COLORS: Record<string, string> = {
  Read: '#60a5fa',
  Edit: '#f59e0b',
  Write: '#f97316',
  Bash: '#a78bfa',
  Grep: '#34d399',
  Glob: '#2dd4bf',
  Skill: '#e879f9',
  WebFetch: '#38bdf8',
  WebSearch: '#818cf8',
  NotebookEdit: '#fb923c',
  Task: '#c084fc',
  Agent: '#c084fc',
  TodoWrite: '#94a3b8',
};

export interface SparklinePoint {
  x: number;
  y: number;
}

export function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return '<1s';
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

export function formatPercent(n: number): string {
  if (n === 0) return '0%';
  if (n < 0.1) return '<0.1%';
  return `${n.toFixed(1)}%`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function getToolColor(toolName: string): string {
  if (TOOL_COLORS[toolName]) return TOOL_COLORS[toolName];
  if (toolName.startsWith('mcp__')) return '#94a3b8';
  return 'var(--accent)';
}

export function sortSessionMetrics(
  sessions: SessionMetrics[],
  sortKey: SortKey,
  sortAsc: boolean,
): SessionMetrics[] {
  return [...sessions].sort((a, b) => {
    const diff = normalizeMetricValue(a[sortKey]) - normalizeMetricValue(b[sortKey]);
    return sortAsc ? diff : -diff;
  });
}

function normalizeMetricValue(value: number): number {
  return value === Infinity ? Number.MAX_SAFE_INTEGER : value;
}

export function getSessionStatusColor(status: string): string {
  if (status === 'running') return '#34d399';
  if (status === 'error') return 'var(--error, #f87171)';
  return 'var(--text-faint)';
}

export function getModelBadgeLabel(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model.slice(0, 12);
}

export function getToolCallStatusColor(status: ToolCallEvent['status']): string {
  if (status === 'pending') return '#fbbf24';
  if (status === 'error') return 'var(--error, #f87171)';
  return '#34d399';
}

export function getSortedFileEditEntries(fileEditCounts: Record<string, number>): [string, number][] {
  return Object.entries(fileEditCounts).sort(([, a], [, b]) => b - a);
}

export function shortenFilePath(filePath: string): string {
  return filePath.split(/[/\\]/).slice(-2).join('/');
}

export function formatToolDuration(duration: number): string {
  return duration < 1_000 ? `${duration}ms` : `${(duration / 1_000).toFixed(1)}s`;
}

export function getEfficiencyTrend(sessions: SessionMetrics[]): number[] {
  return sessions
    .filter((session) => session.efficiencyScore !== Infinity && session.efficiencyScore > 0)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-20)
    .map((session) => session.efficiencyScore);
}

export function getSparklinePoints(
  dataPoints: number[],
  width: number,
  height: number,
  padding: number,
): SparklinePoint[] {
  const maxVal = Math.max(...dataPoints);
  const minVal = Math.min(...dataPoints);
  const range = maxVal - minVal || 1;

  return dataPoints.map((val, index) => ({
    x: padding + (index / (dataPoints.length - 1)) * (width - 2 * padding),
    y: (height - padding) - ((val - minVal) / range) * (height - 2 * padding),
  }));
}
