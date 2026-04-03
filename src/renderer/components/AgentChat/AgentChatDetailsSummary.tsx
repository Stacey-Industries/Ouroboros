import React, { useMemo } from 'react';

import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import type { SummaryPillData } from './agentChatDetailsSupport';
import {
  buildSummaryData,
  buildSummaryPills,
  getLatestLink,
  getStatusDescription,
} from './agentChatDetailsSupport';
import { getStatusLabel, getStatusTone } from './agentChatFormatters';

export interface AgentChatDetailsSummaryProps {
  activeThread: AgentChatThreadRecord;
  details: AgentChatLinkedDetailsResult | null;
  isLoading: boolean;
  onOpenDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  skillCount?: number;
}

interface SummaryPillProps {
  label: string;
  value: string;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function SummaryPill({ label, value }: SummaryPillProps): React.ReactElement {
  return (
    <div className="rounded border border-border-semantic bg-surface-base px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-semantic-muted">{label}</div>
      <div className="mt-1 text-xs text-text-semantic-primary">{value}</div>
    </div>
  );
}

function SummaryHeadline(props: {
  activeThread: AgentChatThreadRecord;
  onOpenDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
}): React.ReactElement {
  const latestLink = getLatestLink(props.activeThread);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-semantic-primary">{getStatusLabel(props.activeThread.status)}</div>
        <div className="mt-1 text-xs leading-5 text-text-semantic-muted">{getStatusDescription(props.activeThread)}</div>
      </div>
      {latestLink ? (
        <button
          onClick={() => void props.onOpenDetails(latestLink)}
          className="rounded border border-border-semantic px-2 py-1 text-[11px] text-text-semantic-muted transition-colors duration-100 hover:border-interactive-accent hover:text-text-semantic-primary"
        >
          Details
        </button>
      ) : null}
    </div>
  );
}

function SummaryGrid({ pills }: { pills: SummaryPillData[] }): React.ReactElement | null {
  if (pills.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {pills.map((pill) => <SummaryPill key={pill.label} label={pill.label} value={pill.value} />)}
    </div>
  );
}

function SummaryVerificationNote({ summary }: { summary: string | null }): React.ReactElement | null {
  if (!summary) {
    return null;
  }

  return (
    <div className="mt-3 rounded border border-border-semantic bg-surface-base px-2.5 py-2 text-xs leading-5 text-text-semantic-muted">
      {summary}
    </div>
  );
}

export function AgentChatDetailsSummary({
  activeThread,
  details,
  isLoading,
  onOpenDetails,
  skillCount,
}: AgentChatDetailsSummaryProps): React.ReactElement {
  const summary = useMemo(() => buildSummaryData(details, { skillCount: skillCount ?? 0 }), [details, skillCount]);
  const pills = useMemo(
    () => buildSummaryPills({ formatCount, hasDetails: Boolean(details), isLoading, summary }),
    [details, isLoading, summary],
  );

  return (
    <div className="rounded border px-3 py-3" style={getStatusTone(activeThread.status)}>
      <SummaryHeadline activeThread={activeThread} onOpenDetails={onOpenDetails} />
      <SummaryGrid pills={pills} />
      <SummaryVerificationNote summary={summary.verificationSummary} />
    </div>
  );
}
