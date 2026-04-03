/**
 * UsageCurrentTab.parts.tsx - Session card sub-components for UsageCurrentTab.
 * Extracted to keep the main file under 300 lines.
 */

import React from 'react';

import type { SessionDetail } from '../../types/electron';
import {
  formatCost,
  formatDuration,
  formatTokens,
  modelColor,
  modelShortName,
  StatRow,
} from './UsagePanelShared';

function SessionHeader({
  detail,
  isLatest,
}: {
  detail: SessionDetail;
  isLatest: boolean;
}): React.JSX.Element {
  const model = detail.totals.model;
  const badgeColor = modelColor(model);

  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: isLatest ? '#34d399' : 'var(--text-faint)' }}
      />
      <span className="text-[12px] font-semibold text-text-semantic-primary">
        Session {detail.sessionId.slice(0, 8)}
      </span>
      {model && model !== 'unknown' && (
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
          style={{
            color: badgeColor,
            background: `color-mix(in srgb, ${badgeColor} 15%, transparent)`,
          }}
        >
          {modelShortName(model)}
        </span>
      )}
      {isLatest && (
        <span
          className="rounded px-1.5 py-0.5 text-[9px]"
          style={{ color: '#34d399', background: 'rgba(52, 211, 153, 0.1)' }}
        >
          LATEST
        </span>
      )}
    </div>
  );
}

function TokenUsageCard({ detail }: { detail: SessionDetail }): React.JSX.Element {
  const rows = [
    ['Input tokens', formatTokens(detail.totals.inputTokens)],
    ['Output tokens', formatTokens(detail.totals.outputTokens)],
    ['Cache read tokens', formatTokens(detail.totals.cacheReadTokens)],
    ['Cache write tokens', formatTokens(detail.totals.cacheWriteTokens)],
  ];

  return (
    <div
      className="mb-2 rounded-md p-3 bg-surface-raised"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <div className="mb-2 text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint">
        Token Usage
      </div>
      {rows.map(([label, value]) => (
        <StatRow key={label} label={label} value={value} />
      ))}
      <div className="mt-1 flex items-center justify-between pt-1.5 border-t border-border-semantic">
        <span className="text-[11px] font-semibold text-text-semantic-primary">Total tokens</span>
        <span
          className="text-[13px] font-bold tabular-nums text-interactive-accent"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {formatTokens(detail.totals.totalTokens)}
        </span>
      </div>
    </div>
  );
}

function SessionMetaCard({ detail }: { detail: SessionDetail }): React.JSX.Element {
  return (
    <div
      className="rounded-md p-3 bg-surface-raised"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <StatRow
        label="Estimated cost"
        value={formatCost(detail.totals.estimatedCost)}
        color="var(--interactive-accent)"
      />
      <StatRow label="API calls" value={String(detail.totals.messageCount)} />
      <StatRow label="Duration" value={formatDuration(detail.totals.durationMs)} />
      <StatRow label="Session ID" value={`${detail.sessionId.slice(0, 8)}...`} />
    </div>
  );
}

export function SessionCard({
  detail,
  isLatest,
}: {
  detail: SessionDetail;
  isLatest: boolean;
}): React.JSX.Element {
  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <SessionHeader detail={detail} isLatest={isLatest} />
      <div className="flex flex-col gap-0">
        <TokenUsageCard detail={detail} />
        <SessionMetaCard detail={detail} />
      </div>
    </div>
  );
}
