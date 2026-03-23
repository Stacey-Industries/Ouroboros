import React from 'react';

import type { SessionUsage } from '../../types/electron';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TimeRange = 'today' | '7d' | '30d' | 'all';

export const HISTORY_RANGES: { key: TimeRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

export const USAGE_REFRESH_MS = 10_000;

export function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

export function getTimeSince(range: TimeRange): number | undefined {
  if (range === 'all') return undefined;
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return Date.now() - (range === '7d' ? 7 : 30) * DAY_MS;
}

export function modelColor(model: string): string {
  const value = model.toLowerCase();
  if (value.includes('opus')) return '#c084fc';
  if (value.includes('sonnet')) return '#60a5fa';
  if (value.includes('haiku')) return '#34d399';
  return 'var(--text-muted)';
}

export function modelShortName(model: string): string {
  const value = model.toLowerCase();
  if (value.includes('opus')) return 'Opus';
  if (value.includes('sonnet')) return 'Sonnet';
  if (value.includes('haiku')) return 'Haiku';
  return model.slice(0, 12);
}

export function summarizeModels(
  sessions: SessionUsage[],
): Array<{ name: string; color: string; tokens: number; cost: number }> {
  const models = new Map<string, { name: string; color: string; tokens: number; cost: number }>();
  sessions.forEach((session) => {
    const name = modelShortName(session.model);
    const existing = models.get(name) ?? { name, color: modelColor(name), tokens: 0, cost: 0 };
    existing.tokens += session.inputTokens + session.outputTokens;
    existing.cost += session.estimatedCost;
    models.set(name, existing);
  });
  return Array.from(models.values()).sort((left, right) => right.tokens - left.tokens);
}

export function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}): React.ReactElement {
  return (
    <div
      className="flex items-center justify-between py-1"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[11px] text-text-semantic-muted">{label}</span>
      <span
        className="text-[12px] font-semibold tabular-nums"
        style={{ color: color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </span>
    </div>
  );
}
