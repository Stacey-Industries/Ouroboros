import type { SessionUsage, UsageTotals } from '../../types/electron';

export type TimeRange = 'today' | '7d' | '30d' | 'all';

export interface TimeRangeOption {
  key: TimeRange;
  label: string;
}

export interface SummaryCardData {
  label: string;
  value: string;
  sub?: string;
}

export interface ModelUsageRow {
  name: string;
  tokens: number;
  cost: number;
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

export function formatTokens(value: number): string {
  if (value === 0) return '0';
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

export function formatCost(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(timestamp: number): string {
  const mins = Math.floor((Date.now() - timestamp) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export function getTimeSince(range: TimeRange): number | undefined {
  const now = Date.now();

  switch (range) {
    case 'today': {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000;
    case 'all':
      return undefined;
  }
}

export function modelColor(model: string): string {
  const name = model.toLowerCase();
  if (name.includes('opus')) return '#c084fc';
  if (name.includes('sonnet')) return '#60a5fa';
  if (name.includes('haiku')) return '#34d399';
  return 'var(--text-muted)';
}

export function modelShortName(model: string): string {
  const name = model.toLowerCase();
  if (name.includes('opus')) return 'Opus';
  if (name.includes('sonnet')) return 'Sonnet';
  if (name.includes('haiku')) return 'Haiku';
  return model.slice(0, 12);
}

export function getSessionTotalTokens(session: SessionUsage): number {
  return session.inputTokens + session.outputTokens;
}

export function getSummaryCards(totals: UsageTotals): SummaryCardData[] {
  return [
    { label: 'Sessions', value: String(totals.sessionCount), sub: `${totals.messageCount} messages` },
    { label: 'Input Tokens', value: formatTokens(totals.inputTokens) },
    { label: 'Output Tokens', value: formatTokens(totals.outputTokens) },
    { label: 'Cache Read', value: formatTokens(totals.cacheReadTokens) },
    { label: 'Cache Write', value: formatTokens(totals.cacheWriteTokens) },
    { label: 'Est. Cost', value: formatCost(totals.estimatedCost) },
  ];
}

export function getModelRows(sessions: SessionUsage[]): ModelUsageRow[] {
  const usageByModel = new Map<string, ModelUsageRow>();

  for (const session of sessions) {
    const name = modelShortName(session.model);
    const existing = usageByModel.get(name) ?? { name, tokens: 0, cost: 0 };
    existing.tokens += getSessionTotalTokens(session);
    existing.cost += session.estimatedCost;
    usageByModel.set(name, existing);
  }

  return Array.from(usageByModel.values()).sort((left, right) => right.tokens - left.tokens);
}
