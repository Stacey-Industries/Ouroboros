import React, { memo, useMemo } from 'react';

import type { AgentMonitorViewMode } from '../../types/electron';
import { MultiSessionLauncher, MultiSessionMonitor } from '../MultiSession';
import { AgentCard } from './AgentCard';
import { ComparePanel, EmptyState, PreviousSessionsSection } from './AgentMonitorManagerPanels';
import { AgentTree } from './AgentTree';
import { CostDashboard } from './CostDashboard';
import type { AgentSession } from './types';
import { isEventTypeVisible } from './viewModeFilter';

/** Build a map of sessionId -> number of direct children for the given sessions. */
function buildChildCountMap(sessions: AgentSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    if (session.parentSessionId) {
      map.set(session.parentSessionId, (map.get(session.parentSessionId) ?? 0) + 1);
    }
  }
  return map;
}

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
  viewMode?: AgentMonitorViewMode;
  visibleCurrentSessions: AgentSession[];
  visibleHistoricalSessions: AgentSession[];
}

/** Map AgentSession status to a hook event type string for viewMode filtering. */
function sessionStatusToEventType(status: AgentSession['status']): string {
  if (status === 'error') return 'post_tool_use_failure';
  if (status === 'running') return 'pre_tool_use';
  return 'session_end';
}

function applyViewModeToSessions(
  sessions: AgentSession[],
  viewMode: AgentMonitorViewMode,
): AgentSession[] {
  if (viewMode === 'verbose') return sessions;
  return sessions.filter((s) =>
    isEventTypeVisible(sessionStatusToEventType(s.status), viewMode),
  );
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
}: SessionCardListProps): React.ReactElement<unknown> {
  const childCounts = useMemo(() => buildChildCountMap(sessions), [sessions]);

  return (
    <>
      {sessions.map((session) => (
        <AgentCard
          key={session.id}
          session={session}
          onDismiss={onDismiss}
          onUpdateNotes={onUpdateNotes}
          onReviewChanges={onReviewChanges}
          onReplay={onReplay}
          childCount={childCounts.get(session.id)}
        />
      ))}
    </>
  );
});

const NoMatchesState = memo(function NoMatchesState({
  query,
}: {
  query: string;
}): React.ReactElement<unknown> {
  return (
    <div className="px-4 py-6 text-center text-[12px] italic text-text-semantic-faint">
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
}): React.ReactElement<unknown> {
  return (
    <div
      className="flex-1 min-h-0"
      style={{ display: 'flex', gap: '0', height: '100%', overflow: 'hidden' }}
    >
      <ComparePanel
        sessions={sessions}
        selectedId={compareSessionIds[0]}
        onSelect={handleSelectCompareA}
        label="Session A"
        onDismiss={dismiss}
      />
      <div style={{ width: '1px', background: 'var(--border-default)', flexShrink: 0 }} />
      <ComparePanel
        sessions={sessions}
        selectedId={compareSessionIds[1]}
        onSelect={handleSelectCompareB}
        label="Session B"
        onDismiss={dismiss}
      />
    </div>
  );
});

interface NormalMonitorPaneProps {
  dismiss: (id: string) => void;
  filterQuery: string;
  handleReplay: (sessionId: string) => void;
  handleReviewChanges: (sessionId: string) => void;
  updateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  useTree: boolean;
  visibleCurrentSessions: AgentSession[];
  visibleHistoricalSessions: AgentSession[];
}

function CurrentSessionsView({
  dismiss,
  handleReplay,
  handleReviewChanges,
  updateNotes,
  useTree,
  visibleCurrentSessions,
}: Omit<NormalMonitorPaneProps, 'filterQuery' | 'visibleHistoricalSessions'>): React.ReactElement<unknown> {
  if (useTree) {
    return <AgentTree sessions={visibleCurrentSessions} onDismiss={dismiss} />;
  }
  return (
    <SessionCardList
      sessions={visibleCurrentSessions}
      onDismiss={dismiss}
      onUpdateNotes={updateNotes}
      onReviewChanges={handleReviewChanges}
      onReplay={handleReplay}
    />
  );
}

const NormalMonitorPane = memo(function NormalMonitorPane({
  dismiss,
  filterQuery,
  handleReplay,
  handleReviewChanges,
  updateNotes,
  useTree,
  visibleCurrentSessions,
  visibleHistoricalSessions,
}: NormalMonitorPaneProps): React.ReactElement<unknown> {
  const hasVisibleSessions =
    visibleCurrentSessions.length > 0 || visibleHistoricalSessions.length > 0;
  if (!hasVisibleSessions)
    return filterQuery ? <NoMatchesState query={filterQuery} /> : <EmptyState />;

  return (
    <>
      <CurrentSessionsView
        dismiss={dismiss}
        handleReplay={handleReplay}
        handleReviewChanges={handleReviewChanges}
        updateNotes={updateNotes}
        useTree={useTree}
        visibleCurrentSessions={visibleCurrentSessions}
      />
      <PreviousSessionsSection
        sessions={visibleHistoricalSessions}
        onDismiss={dismiss}
        onUpdateNotes={updateNotes}
        onReviewChanges={handleReviewChanges}
        onReplay={handleReplay}
      />
    </>
  );
});

function resolveMultiSessionContent(
  props: AgentMonitorManagerContentProps,
): React.ReactElement<unknown> | null {
  if (props.multiSessionMode === 'launcher') {
    return (
      <div className="flex-1 min-h-0 overflow-hidden">
        <MultiSessionLauncher
          onClose={props.handleMultiSessionClose}
          onLaunched={props.handleMultiSessionLaunched}
        />
      </div>
    );
  }
  if (props.multiSessionMode === 'monitor') {
    return (
      <div className="flex-1 min-h-0 overflow-hidden">
        <MultiSessionMonitor
          batchLabels={props.multiBatchLabels}
          onClose={props.handleMultiSessionClose}
        />
      </div>
    );
  }
  return null;
}

function NormalModeWrapper(props: AgentMonitorManagerContentProps): React.ReactElement<unknown> {
  const mode = props.viewMode ?? 'normal';
  const filteredCurrent = useMemo(
    () => applyViewModeToSessions(props.visibleCurrentSessions, mode),
    [props.visibleCurrentSessions, mode],
  );
  const filteredHistorical = useMemo(
    () => applyViewModeToSessions(props.visibleHistoricalSessions, mode),
    [props.visibleHistoricalSessions, mode],
  );
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <NormalMonitorPane
        dismiss={props.dismiss}
        filterQuery={props.filterQuery}
        handleReplay={props.handleReplay}
        handleReviewChanges={props.handleReviewChanges}
        updateNotes={props.updateNotes}
        useTree={props.useTree}
        visibleCurrentSessions={filteredCurrent}
        visibleHistoricalSessions={filteredHistorical}
      />
    </div>
  );
}

const ResolvedModeContent = memo(function ResolvedModeContent(
  props: AgentMonitorManagerContentProps,
): React.ReactElement<unknown> {
  const multiSession = resolveMultiSessionContent(props);
  if (multiSession) return multiSession;

  if (props.costMode)
    return (
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <CostDashboard sessions={props.agents} />
      </div>
    );
  if (props.compareMode)
    return (
      <CompareModePane
        sessions={props.agents}
        compareSessionIds={props.compareSessionIds}
        handleSelectCompareA={props.handleSelectCompareA}
        handleSelectCompareB={props.handleSelectCompareB}
        dismiss={props.dismiss}
      />
    );

  return <NormalModeWrapper {...props} />;
});

export const AgentMonitorManagerContent = memo(function AgentMonitorManagerContent(
  props: AgentMonitorManagerContentProps,
): React.ReactElement<unknown> {
  return <ResolvedModeContent {...props} />;
});
