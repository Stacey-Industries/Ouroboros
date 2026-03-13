import React, { memo } from 'react';
import { MultiSessionLauncher, MultiSessionMonitor } from '../MultiSession';
import { CostDashboard } from './CostDashboard';
import { AgentCard } from './AgentCard';
import { AgentTree } from './AgentTree';
import { ComparePanel, EmptyState, PreviousSessionsSection } from './AgentMonitorManagerPanels';
import type { AgentSession } from './types';

interface AgentMonitorManagerContentProps {
  agents: AgentSession[];
  compareMode: boolean;
  compareSessionIds: [string | null, string | null];
  costMode: boolean;
  dismiss: (id: string) => void;
  filterQuery: string;
  handleMultiSessionClose: () => void;
  handleMultiSessionLaunched: (labels: string[]) => void;
  handleReplay: (sessionId: string) => void;
  handleReviewChanges: (sessionId: string) => void;
  handleSelectCompareA: (id: string) => void;
  handleSelectCompareB: (id: string) => void;
  multiBatchLabels: string[];
  multiSessionMode: 'off' | 'launcher' | 'monitor';
  updateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  useTree: boolean;
  visibleCurrentSessions: AgentSession[];
  visibleHistoricalSessions: AgentSession[];
}

interface SessionCardListProps {
  onDismiss: (id: string) => void;
  onReplay: (sessionId: string) => void;
  onReviewChanges: (sessionId: string) => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  sessions: AgentSession[];
}

const SessionCardList = memo(function SessionCardList({
  onDismiss,
  onReplay,
  onReviewChanges,
  onUpdateNotes,
  sessions,
}: SessionCardListProps): React.ReactElement {
  return (
    <>
      {sessions.map((session) => <AgentCard key={session.id} session={session} onDismiss={onDismiss} onUpdateNotes={onUpdateNotes} onReviewChanges={onReviewChanges} onReplay={onReplay} />)}
    </>
  );
});

const NoMatchesState = memo(function NoMatchesState({ query }: { query: string }): React.ReactElement {
  return (
    <div className="px-4 py-6 text-center text-[12px] italic" style={{ color: 'var(--text-faint)' }}>
      No sessions match &ldquo;{query}&rdquo;
    </div>
  );
});

const CompareModePane = memo(function CompareModePane({
  compareSessionIds,
  dismiss,
  handleSelectCompareA,
  handleSelectCompareB,
  sessions,
}: {
  compareSessionIds: [string | null, string | null];
  dismiss: (id: string) => void;
  handleSelectCompareA: (id: string) => void;
  handleSelectCompareB: (id: string) => void;
  sessions: AgentSession[];
}): React.ReactElement {
  return (
    <div className="flex-1 min-h-0" style={{ display: 'flex', gap: '0', height: '100%', overflow: 'hidden' }}>
      <ComparePanel sessions={sessions} selectedId={compareSessionIds[0]} onSelect={handleSelectCompareA} label="Session A" onDismiss={dismiss} />
      <div style={{ width: '1px', background: 'var(--border)', flexShrink: 0 }} />
      <ComparePanel sessions={sessions} selectedId={compareSessionIds[1]} onSelect={handleSelectCompareB} label="Session B" onDismiss={dismiss} />
    </div>
  );
});

const NormalMonitorPane = memo(function NormalMonitorPane({
  dismiss,
  filterQuery,
  handleReplay,
  handleReviewChanges,
  updateNotes,
  useTree,
  visibleCurrentSessions,
  visibleHistoricalSessions,
}: {
  dismiss: (id: string) => void;
  filterQuery: string;
  handleReplay: (sessionId: string) => void;
  handleReviewChanges: (sessionId: string) => void;
  updateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  useTree: boolean;
  visibleCurrentSessions: AgentSession[];
  visibleHistoricalSessions: AgentSession[];
}): React.ReactElement {
  const hasVisibleSessions = visibleCurrentSessions.length > 0 || visibleHistoricalSessions.length > 0;
  if (!hasVisibleSessions) return filterQuery ? <NoMatchesState query={filterQuery} /> : <EmptyState />;

  return (
    <>
      {useTree ? <AgentTree sessions={visibleCurrentSessions} onDismiss={dismiss} /> : <SessionCardList sessions={visibleCurrentSessions} onDismiss={dismiss} onUpdateNotes={updateNotes} onReviewChanges={handleReviewChanges} onReplay={handleReplay} />}
      <PreviousSessionsSection sessions={visibleHistoricalSessions} onDismiss={dismiss} onUpdateNotes={updateNotes} onReviewChanges={handleReviewChanges} onReplay={handleReplay} />
    </>
  );
});

const ResolvedModeContent = memo(function ResolvedModeContent(
  props: AgentMonitorManagerContentProps,
): React.ReactElement {
  if (props.multiSessionMode === 'launcher') {
    return <div className="flex-1 min-h-0 overflow-hidden"><MultiSessionLauncher onClose={props.handleMultiSessionClose} onLaunched={props.handleMultiSessionLaunched} /></div>;
  }

  if (props.multiSessionMode === 'monitor') {
    return <div className="flex-1 min-h-0 overflow-hidden"><MultiSessionMonitor batchLabels={props.multiBatchLabels} onClose={props.handleMultiSessionClose} /></div>;
  }

  if (props.costMode) return <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"><CostDashboard sessions={props.agents} /></div>;
  if (props.compareMode) return <CompareModePane sessions={props.agents} compareSessionIds={props.compareSessionIds} handleSelectCompareA={props.handleSelectCompareA} handleSelectCompareB={props.handleSelectCompareB} dismiss={props.dismiss} />;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <NormalMonitorPane
        dismiss={props.dismiss}
        filterQuery={props.filterQuery}
        handleReplay={props.handleReplay}
        handleReviewChanges={props.handleReviewChanges}
        updateNotes={props.updateNotes}
        useTree={props.useTree}
        visibleCurrentSessions={props.visibleCurrentSessions}
        visibleHistoricalSessions={props.visibleHistoricalSessions}
      />
    </div>
  );
});

export const AgentMonitorManagerContent = memo(function AgentMonitorManagerContent(
  props: AgentMonitorManagerContentProps,
): React.ReactElement {
  return <ResolvedModeContent {...props} />;
});
