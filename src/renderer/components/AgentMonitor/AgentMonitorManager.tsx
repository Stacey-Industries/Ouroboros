import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useProject } from '../../contexts/ProjectContext';
import { useToastContext } from '../../contexts/ToastContext';
import { useCostTracking } from '../../hooks/useCostTracking';
import { useDiffSnapshots } from '../../hooks/useDiffSnapshots';
import type { AgentTemplate } from '../../types/electron';
import { AgentMonitorManagerContent } from './AgentMonitorManagerContent';
import { MonitorToolbar, QuickActionBar } from './AgentMonitorManagerPanels';
import { enrichSessions, filterSessions } from './agentMonitorManagerUtils';
import { AgentSummaryBar } from './AgentSummaryBar';
import { hasTreeStructure } from './AgentTree';
import type { AgentSession } from './types';
import { type AgentMonitorModes, useAgentMonitorModes } from './useAgentMonitorModes';
import { useAgentMonitorTemplates } from './useAgentMonitorTemplates';
import { useCompletionNotifications } from './useCompletionNotifications';

/**
 * Show ALL agent sessions in the monitor. Main agent sessions are tagged
 * for visual distinction, and subagent sessions (parentSessionId set) are
 * shown nested or indented. Previously this filtered to subagents-only,
 * which caused the monitor to appear empty when parentSessionId wasn't
 * flowing through the hooks pipeline.
 */

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);
  return debounced;
}

type EnrichFn = (sessionId: string) => string | undefined;

function useVisibleSessions(
  currentSessions: AgentSession[],
  historicalSessions: AgentSession[],
  filterQuery: string,
  enrichFn: EnrichFn,
) {
  return useMemo(
    () => ({
      visibleCurrentSessions: enrichSessions(
        filterSessions(currentSessions, filterQuery),
        enrichFn,
      ),
      visibleHistoricalSessions: enrichSessions(
        filterSessions(historicalSessions, filterQuery),
        enrichFn,
      ),
    }),
    [currentSessions, filterQuery, enrichFn, historicalSessions],
  );
}

function useSessionHandlers(
  enrichedAgents: AgentSession[],
  projectRoot: string | null | undefined,
  toast: ReturnType<typeof useToastContext>['toast'],
) {
  const handleReplay = useCallback(
    (sessionId: string) => openReplay(enrichedAgents.find((s) => s.id === sessionId)),
    [enrichedAgents],
  );
  const handleReviewChanges = useCallback(
    (sessionId: string) =>
      reviewChanges(
        enrichedAgents.find((s) => s.id === sessionId),
        projectRoot,
        sessionId,
        toast,
      ),
    [enrichedAgents, projectRoot, toast],
  );
  return { handleReplay, handleReviewChanges };
}

interface DerivedOpts {
  agents: AgentSession[];
  currentSessions: AgentSession[];
  historicalSessions: AgentSession[];
  filterQuery: string;
  enrichFn: EnrichFn;
  projectRoot: string | null | undefined;
  toast: ReturnType<typeof useToastContext>['toast'];
}

function useAgentMonitorDerived(opts: DerivedOpts) {
  const { agents, currentSessions, historicalSessions, filterQuery, enrichFn, projectRoot, toast } =
    opts;
  const { visibleCurrentSessions, visibleHistoricalSessions } = useVisibleSessions(
    currentSessions,
    historicalSessions,
    filterQuery,
    enrichFn,
  );
  const enrichedAgents = useMemo(() => enrichSessions(agents, enrichFn), [agents, enrichFn]);
  const useTree =
    visibleCurrentSessions.length > 0 && !filterQuery && hasTreeStructure(visibleCurrentSessions);
  const { handleReplay, handleReviewChanges } = useSessionHandlers(
    enrichedAgents,
    projectRoot,
    toast,
  );
  return {
    handleReplay,
    handleReviewChanges,
    useTree,
    visibleCurrentSessions,
    visibleHistoricalSessions,
  };
}

function useAgentMonitorState() {
  const { agents, clearCompleted, currentSessions, dismiss, historicalSessions, updateNotes } =
    useAgentEventsContext();
  const { toast } = useToastContext();
  const { projectRoot } = useProject();
  const { getSnapshotHash } = useDiffSnapshots();
  const getSnapshotHashForEnrich = useCallback(
    (sessionId: string) => getSnapshotHash(sessionId) ?? undefined,
    [getSnapshotHash],
  );
  const modes = useAgentMonitorModes();
  const { executeTemplate, templates } = useAgentMonitorTemplates(projectRoot);
  const debouncedFilterQuery = useDebouncedValue(modes.filterQuery, 150);
  const derived = useAgentMonitorDerived({
    agents,
    currentSessions,
    historicalSessions,
    filterQuery: debouncedFilterQuery,
    enrichFn: getSnapshotHashForEnrich,
    projectRoot,
    toast,
  });
  useCostTracking(agents);
  useCompletionNotifications(agents, toast);
  return {
    agents,
    clearCompleted,
    dismiss,
    executeTemplate,
    modes,
    templates,
    updateNotes,
    ...derived,
  };
}

interface MonitorBodyProps {
  agents: AgentSession[];
  clearCompleted: () => void;
  dismiss: (id: string) => void;
  executeTemplate: (template: AgentTemplate) => void;
  handleReplay: (sessionId: string) => void;
  handleReviewChanges: (sessionId: string) => void;
  modes: AgentMonitorModes;
  templates: AgentTemplate[];
  updateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  useTree: boolean;
  visibleCurrentSessions: AgentSession[];
  visibleHistoricalSessions: AgentSession[];
}

const MonitorContent = memo(function MonitorContent(
  p: MonitorBodyProps,
): React.ReactElement<unknown> {
  return (
    <AgentMonitorManagerContent
      agents={p.agents}
      compareMode={p.modes.compareMode}
      compareSessionIds={p.modes.compareSessionIds}
      costMode={p.modes.costMode}
      dismiss={p.dismiss}
      filterQuery={p.modes.filterQuery}
      handleMultiSessionClose={p.modes.handleMultiSessionClose}
      handleMultiSessionLaunched={p.modes.handleMultiSessionLaunched}
      handleReplay={p.handleReplay}
      handleReviewChanges={p.handleReviewChanges}
      handleSelectCompareA={p.modes.handleSelectCompareA}
      handleSelectCompareB={p.modes.handleSelectCompareB}
      multiBatchLabels={p.modes.multiBatchLabels}
      multiSessionMode={p.modes.multiSessionMode}
      updateNotes={p.updateNotes}
      useTree={p.useTree}
      visibleCurrentSessions={p.visibleCurrentSessions}
      visibleHistoricalSessions={p.visibleHistoricalSessions}
    />
  );
});

const MonitorBody = memo(function MonitorBody(p: MonitorBodyProps): React.ReactElement<unknown> {
  return (
    <div className="flex flex-col h-full min-h-0">
      <QuickActionBar templates={p.templates} onExecuteTemplate={p.executeTemplate} />
      {p.agents.length > 0 ? (
        <div className="flex-shrink-0">
          <AgentSummaryBar sessions={p.agents} onClearCompleted={p.clearCompleted} />
        </div>
      ) : null}
      <MonitorToolbar
        hasAnySessions={p.agents.length > 0}
        filterQuery={p.modes.filterQuery}
        onFilterChange={p.modes.setFilterQuery}
        compareMode={p.modes.compareMode}
        costMode={p.modes.costMode}
        multiSessionMode={p.modes.multiSessionMode}
        onToggleCompare={p.modes.handleToggleCompare}
        onToggleCost={p.modes.handleToggleCost}
        onToggleMultiSession={p.modes.handleToggleMultiSession}
      />
      <MonitorContent {...p} />
    </div>
  );
});

export const AgentMonitorManager = memo(
  function AgentMonitorManager(): React.ReactElement<unknown> {
    const state = useAgentMonitorState();
    return <MonitorBody {...state} />;
  },
);

function openReplay(session: AgentSession | undefined): void {
  if (!session) return;
  window.dispatchEvent(new CustomEvent('agent-ide:open-session-replay', { detail: { session } }));
}

function reviewChanges(
  session: AgentSession | undefined,
  projectRoot: string | null | undefined,
  sessionId: string,
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void,
): void {
  if (!session?.snapshotHash || !projectRoot) {
    toast('No snapshot available for this session', 'error');
    return;
  }

  window.dispatchEvent(
    new CustomEvent('agent-ide:open-diff-review', {
      detail: { sessionId, snapshotHash: session.snapshotHash, projectRoot },
    }),
  );
}
