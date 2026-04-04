/**
 * CompactionIndicator.tsx — Shows context compaction events with count and failure state.
 */

import React, { memo } from 'react';

import type { CompactionEvent } from './types';

interface CompactionIndicatorProps {
  compactions: CompactionEvent[] | undefined;
  failedCompactions?: number;
}

export function formatCompactionTokens(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

function mostRecent(compactions: CompactionEvent[]): CompactionEvent {
  return compactions.reduce((best, c) => (c.timestamp > best.timestamp ? c : best));
}

function buildLabel(pre: string, post: string, count: number, failed: number): string {
  const countPrefix = count > 1 ? `${count}\u00d7 ` : '';
  const failSuffix = failed > 0 ? ` (${failed} failed)` : '';
  return `${countPrefix}\u2713 ${pre}\u2192${post}${failSuffix}`;
}

function buildTitle(latest: CompactionEvent, count: number, failed: number): string {
  const base = `Context compacted: ${latest.preTokens.toLocaleString()} \u2192 ${latest.postTokens.toLocaleString()} tokens`;
  const totalNote = count > 1 ? ` (${count} total)` : '';
  const failNote = failed > 0 ? ` \u2014 ${failed} failed` : '';
  return `${base}${totalNote}${failNote}`;
}

export const CompactionIndicator = memo(function CompactionIndicator({
  compactions,
  failedCompactions = 0,
}: CompactionIndicatorProps): React.ReactElement<unknown> | null {
  if (!compactions || compactions.length === 0) return null;

  const latest = mostRecent(compactions);
  const pre = formatCompactionTokens(latest.preTokens);
  const post = formatCompactionTokens(latest.postTokens);
  const colorClass = failedCompactions > 0 ? 'text-status-warning' : 'text-text-semantic-faint';

  return (
    <span
      className={`text-[10px] tabular-nums ${colorClass}`}
      title={buildTitle(latest, compactions.length, failedCompactions)}
    >
      {buildLabel(pre, post, compactions.length, failedCompactions)}
    </span>
  );
});
