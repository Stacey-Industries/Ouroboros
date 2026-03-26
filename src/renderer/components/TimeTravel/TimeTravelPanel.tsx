import React from 'react';

import { useProject } from '../../contexts/ProjectContext';
import type { WorkspaceSnapshot } from '../../types/electron';
import { TimeTravelControls } from './TimeTravelControls';
import { RestoreConfirmDialog, TimeTravelDetailsPane } from './TimeTravelDetails';
import { TimeTravelTimelinePane } from './TimeTravelTimeline';
import { useTimeTravelPanelState } from './useTimeTravelPanelState';

export interface TimeTravelPanelProps {
  snapshots: WorkspaceSnapshot[];
  onCreateSnapshot: (label?: string) => Promise<WorkspaceSnapshot | null>;
  onRefreshSnapshots: () => Promise<void>;
  onClose: () => void;
}

export function TimeTravelPanel({
  snapshots,
  onCreateSnapshot,
  onRefreshSnapshots,
  onClose,
}: TimeTravelPanelProps): React.ReactElement {
  const { projectRoot } = useProject();
  const panel = useTimeTravelPanelState({ projectRoot: projectRoot ?? undefined, snapshots, onCreateSnapshot, onRefreshSnapshots });
  const hasDetailPane = Boolean(panel.selectedSnapshot || panel.comparisonReady);

  return (
    <div className="bg-surface-base text-text-semantic-primary" style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-ui)' }}>
      <TimeTravelControls snapshotCount={panel.sortedSnapshots.length} onClose={onClose} panel={panel} onRefreshSnapshots={onRefreshSnapshots} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <TimeTravelTimelinePane snapshots={panel.sortedSnapshots} hasDetailPane={hasDetailPane} panel={panel} />
        {hasDetailPane && <TimeTravelDetailsPane panel={panel} />}
      </div>
      {panel.confirmRestore && (
        <RestoreConfirmDialog
          snapshot={panel.confirmRestore}
          dirtyCount={panel.dirtyCount}
          onConfirm={panel.handleConfirmRestore}
          onCancel={() => panel.setConfirmRestore(null)}
        />
      )}
    </div>
  );
}
