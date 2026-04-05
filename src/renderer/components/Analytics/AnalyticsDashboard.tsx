import React, { memo, useMemo, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useRouterStats } from '../../hooks/useRouterStats';
import { useSessionAnalytics } from '../../hooks/useSessionAnalytics';
import {
  AnalyticsEmptyState,
  AnalyticsSummaryGrid,
  EfficiencySparkline,
  ToolDistributionChart,
} from './AnalyticsDashboardOverview';
import { SessionDetailPanel, SessionHistoryTable } from './AnalyticsDashboardSessions';
import { RouterAnalyticsPanel } from './RouterAnalyticsPanel';

export const AnalyticsDashboard = memo(function AnalyticsDashboard(): React.ReactElement {
  const { agents } = useAgentEventsContext();
  const { sessions, aggregate, toolDistribution } = useSessionAnalytics(agents);
  const { stats: routerStats } = useRouterStats();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const selectedSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );

  if (agents.length === 0) {
    return (
      <div
        className="h-full overflow-y-auto bg-surface-base"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        <AnalyticsEmptyState />
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto bg-surface-base"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <AnalyticsSummaryGrid aggregate={aggregate} />
      <ToolDistributionChart distribution={toolDistribution} />
      <EfficiencySparkline sessions={sessions} />
      <RouterAnalyticsPanel stats={routerStats} />
      {selectedSession ? (
        <SessionDetailPanel session={selectedSession} onClose={() => setSelectedSessionId(null)} />
      ) : null}
      <SessionHistoryTable
        sessions={sessions}
        onSelectSession={setSelectedSessionId}
        selectedSessionId={selectedSessionId}
      />
    </div>
  );
});
