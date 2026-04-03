/**
 * CompactionIndicator.tsx — Shows the most recent context compaction event.
 */

import React, { memo } from 'react';

import type { CompactionEvent } from './types';

interface CompactionIndicatorProps {
  compactions: CompactionEvent[] | undefined;
}

export function formatCompactionTokens(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

function mostRecent(compactions: CompactionEvent[]): CompactionEvent {
  return compactions.reduce((best, c) => (c.timestamp > best.timestamp ? c : best));
}

export const CompactionIndicator = memo(function CompactionIndicator({
  compactions,
}: CompactionIndicatorProps): React.ReactElement<unknown> | null {
  if (!compactions || compactions.length === 0) return null;

  const latest = mostRecent(compactions);
  const pre = formatCompactionTokens(latest.preTokens);
  const post = formatCompactionTokens(latest.postTokens);

  return (
    <span
      className="text-[10px] tabular-nums text-text-semantic-faint"
      title={`Context compacted: ${latest.preTokens.toLocaleString()} → ${latest.postTokens.toLocaleString()} tokens`}
    >
      {'\u2713'} {pre}{'\u2192'}{post}
    </span>
  );
});
