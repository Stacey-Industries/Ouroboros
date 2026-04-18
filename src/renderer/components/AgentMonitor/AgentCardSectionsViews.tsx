import React from 'react';

import { useDispatchJobs } from '../../hooks/useDispatchJobs';
import { DispatchBadge } from '../AgentChat/DispatchBadge';
import { CompactionIndicator } from './CompactionIndicator';
import { estimateCost, formatCost, formatTokenCount } from './costCalculator';
import type { AgentSession } from './types';

function agentModelName(modelId?: string): string {
  if (!modelId) return '';
  const m = modelId.toLowerCase();
  if (m.includes(':')) {
    const part = modelId.slice(modelId.indexOf(':') + 1);
    return part.length > 20 ? `${part.slice(0, 18)}...` : part;
  }
  const suffix = m.includes('[1m]') ? ' 1M' : '';
  if (m.includes('opus')) return `Opus${suffix}`;
  if (m.includes('sonnet')) return `Sonnet${suffix}`;
  if (m.includes('haiku')) return 'Haiku';
  return modelId.length > 20 ? `${modelId.slice(0, 18)}...` : modelId;
}

function buildTokenTitle(session: AgentSession): string {
  const base = `Input: ${session.inputTokens.toLocaleString()} tokens | Output: ${session.outputTokens.toLocaleString()} tokens`;
  const cacheRead = session.cacheReadTokens
    ? ` | Cache read: ${session.cacheReadTokens.toLocaleString()}`
    : '';
  const cacheWrite = session.cacheWriteTokens
    ? ` | Cache write: ${session.cacheWriteTokens.toLocaleString()}`
    : '';
  return base + cacheRead + cacheWrite;
}

function TokenUsageSummary({ session }: { session: AgentSession }): React.ReactElement<unknown> | null {
  if (session.inputTokens < 1 && session.outputTokens < 1) return null;
  const estimatedCost = estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  }).totalCost;
  const modelName = agentModelName(session.model);
  return (
    <span
      className="text-[10px] font-mono flex items-center gap-1.5 text-text-semantic-faint"
      title={buildTokenTitle(session)}
    >
      <span className="text-text-semantic-muted">
        {'\u2193'}
        {formatTokenCount(session.inputTokens)}
      </span>
      <span className="text-text-semantic-muted">
        {'\u2191'}
        {formatTokenCount(session.outputTokens)}
      </span>
      <span className="text-text-semantic-faint">tokens</span>
      <span className="text-text-semantic-faint">{'\u00b7'}</span>
      <span className="text-interactive-accent">~{formatCost(estimatedCost)}</span>
      {modelName && (
        <>
          <span className="text-text-semantic-faint">{'\u00b7'}</span>
          <span className="text-text-semantic-muted">{modelName}</span>
        </>
      )}
    </span>
  );
}

function SubagentBadge({ count }: { count: number }): React.ReactElement<unknown> | null {
  if (count < 1) return null;
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 text-interactive-accent"
      style={{
        background: 'color-mix(in srgb, var(--interactive-accent) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--interactive-accent) 25%, transparent)',
        letterSpacing: '0.02em',
      }}
      title={`Spawned ${count} subagent${count !== 1 ? 's' : ''}`}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M5 1V5M5 5H9M5 5H1M5 5V9"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      {count} subagent{count !== 1 ? 's' : ''}
    </span>
  );
}

export function AgentCardMeta({
  session,
  childCount,
}: {
  session: AgentSession;
  childCount?: number;
}): React.ReactElement<unknown> {
  const { jobs } = useDispatchJobs();
  return (
    <div className="px-6 pb-1 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-mono text-text-semantic-faint" title={session.id}>
        {session.id.slice(0, 12)}
      </span>
      {session.restored && (
        <span
          className="text-[9px] px-1 py-0.5 rounded bg-surface-raised text-text-semantic-faint border border-border-semantic"
          style={{ letterSpacing: '0.02em' }}
        >
          restored
        </span>
      )}
      {childCount !== undefined && childCount > 0 && <SubagentBadge count={childCount} />}
      {session.parentSessionId && (
        <span
          className="text-[9px] px-1 py-0.5 rounded bg-surface-raised text-text-semantic-faint border border-border-semantic"
          style={{ letterSpacing: '0.02em' }}
          title={`Parent: ${session.parentSessionId}`}
        >
          subagent
        </span>
      )}
      <DispatchBadge sessionId={session.id} jobs={jobs} />
      <TokenUsageSummary session={session} />
      <CompactionIndicator compactions={session.compactions} failedCompactions={session.failedCompactions} />
    </div>
  );
}
