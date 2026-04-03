import React, { memo, useCallback } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useMultiSessionMonitorModel } from './multiSessionMonitorModel';
import { MonitorFooter, MonitorHeader, SessionGrid } from './MultiSessionMonitorParts';

export interface MultiSessionMonitorProps {
  batchLabels: string[];
  onClose: () => void;
}

export const MultiSessionMonitor = memo(function MultiSessionMonitor({
  batchLabels,
  onClose,
}: MultiSessionMonitorProps): React.JSX.Element {
  const { agents } = useAgentEventsContext();
  const { batchSessions, gridLayout, stats } = useMultiSessionMonitorModel(agents, batchLabels);

  const handleViewFull = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MonitorHeader completed={stats.completed} onClose={onClose} total={stats.total} />
      <SessionGrid
        batchLabels={batchLabels}
        batchSessions={batchSessions}
        gridLayout={gridLayout}
        onViewFull={handleViewFull}
      />
      <MonitorFooter stats={stats} />
    </div>
  );
});
