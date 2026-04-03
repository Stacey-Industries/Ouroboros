import React, { memo, useCallback, useMemo } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useProject } from '../../contexts/ProjectContext';
import { useToastContext } from '../../contexts/ToastContext';
import { useCostTracking } from '../../hooks/useCostTracking';
import { useDiffSnapshots } from '../../hooks/useDiffSnapshots';
import { AgentMonitorManagerContent } from './AgentMonitorManagerContent';
import { MonitorToolbar, QuickActionBar } from './AgentMonitorManagerPanels';
import { enrichSessions, filterSessions } from './agentMonitorManagerUtils';
import { AgentSummaryBar } from './AgentSummaryBar';
import { hasTreeStructure } from './AgentTree';
import type { AgentSession } from './types';
import { useAgentMonitorModes } from './useAgentMonitorModes';
import { useAgentMonitorTemplates } from './useAgentMonitorTemplates';
import { useCompletionNotifications } from './useCompletionNotifications';

/**
 * Show ALL agent sessions in the monitor. Main agent sessions are tagged
 * for visual distinction, and subagent sessions (parentSessionId set) are
 * shown nested or indented. Previously this filtered to subagents-only,
 * which caused the monitor to appear empty when parentSessionId wasn't
 * flowing through the hooks pipeline.
 */

export const AgentMonitorManager = memo(function AgentMonitorManager(): React.ReactElement<unknown> {
  const { agents, clearCompleted, currentSessions, dismiss, historicalSessions, updateNotes } = useAgentEventsContext();
  const { toast } = useToastContext();
  const { projectRoot } = useProject();
  const { getSnapshotHash } = useDiffSnapshots();
  const getSnapshotHashForEnrich = useCallback((sessionId: string) => getSnapshotHash(sessionId) ?? undefined, [getSnapshotHash]);
  const modes = useAgentMonitorModes();
  const { executeTemplate, templates } = useAgentMonitorTemplates(projectRoot);
  const visibleCurrentSessions = useMemo(() => enrichSessions(filterSessions(currentSessions, modes.filterQuery), getSnapshotHashForEnrich), [currentSessions, getSnapshotHashForEnrich, modes.filterQuery]);
  const visibleHistoricalSessions = useMemo(() => enrichSessions(filterSessions(historicalSessions, modes.filterQuery), getSnapshotHashForEnrich), [getSnapshotHashForEnrich, historicalSessions, modes.filterQuery]);
  const enrichedAgents = useMemo(() => enrichSessions(agents, getSnapshotHashForEnrich), [agents, getSnapshotHashForEnrich]);
  const useTree = visibleCurrentSessions.length > 0 && !modes.filterQuery && hasTreeStructure(visibleCurrentSessions);
  const handleReplay = useCallback((sessionId: string) => openReplay(enrichedAgents.find((session) => session.id === sessionId)), [enrichedAgents]);
  const handleReviewChanges = useCallback((sessionId: string) => reviewChanges(enrichedAgents.find((session) => session.id === sessionId), projectRoot, sessionId, toast), [enrichedAgents, projectRoot, toast]);

  useCostTracking(agents);
  useCompletionNotifications(agents, toast);

  return (
    <div className="flex flex-col h-full min-h-0">
      <QuickActionBar templates={templates} onExecuteTemplate={executeTemplate} />
      {agents.length > 0 ? <div className="flex-shrink-0"><AgentSummaryBar sessions={agents} onClearCompleted={clearCompleted} /></div> : null}
      <MonitorToolbar hasAnySessions={agents.length > 0} filterQuery={modes.filterQuery} onFilterChange={modes.setFilterQuery} compareMode={modes.compareMode} costMode={modes.costMode} multiSessionMode={modes.multiSessionMode} onToggleCompare={modes.handleToggleCompare} onToggleCost={modes.handleToggleCost} onToggleMultiSession={modes.handleToggleMultiSession} />
      <AgentMonitorManagerContent agents={agents} compareMode={modes.compareMode} compareSessionIds={modes.compareSessionIds} costMode={modes.costMode} dismiss={dismiss} filterQuery={modes.filterQuery} handleMultiSessionClose={modes.handleMultiSessionClose} handleMultiSessionLaunched={modes.handleMultiSessionLaunched} handleReplay={handleReplay} handleReviewChanges={handleReviewChanges} handleSelectCompareA={modes.handleSelectCompareA} handleSelectCompareB={modes.handleSelectCompareB} multiBatchLabels={modes.multiBatchLabels} multiSessionMode={modes.multiSessionMode} updateNotes={updateNotes} useTree={useTree} visibleCurrentSessions={visibleCurrentSessions} visibleHistoricalSessions={visibleHistoricalSessions} />
    </div>
  );
});

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

  window.dispatchEvent(new CustomEvent('agent-ide:open-diff-review', {
    detail: { sessionId, snapshotHash: session.snapshotHash, projectRoot },
  }));
}
