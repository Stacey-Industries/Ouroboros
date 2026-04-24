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
  /**
   * 'workspace' (default) — shows all workspace snapshots.
   * 'thread' — shows only checkpoints for the active thread.
   * In thread scope, snapshot creation is hidden (checkpoints are auto-created).
   */
  scope?: 'workspace' | 'thread';
}

const PANEL_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-ui)' };
const BODY_STYLE: React.CSSProperties = { display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' };

function TimeTravelRestoreDialog({ panel }: { panel: ReturnType<typeof useTimeTravelPanelState> }): React.JSX.Element | null {
  if (!panel.confirmRestore) return null;
  return <RestoreConfirmDialog snapshot={panel.confirmRestore} dirtyCount={panel.dirtyCount} onConfirm={panel.handleConfirmRestore} onCancel={() => panel.setConfirmRestore(null)} />;
}

export function TimeTravelPanel({ snapshots, onCreateSnapshot, onRefreshSnapshots, onClose, scope = 'workspace' }: TimeTravelPanelProps): React.JSX.Element {
  const { projectRoot } = useProject();
  const panel = useTimeTravelPanelState({ projectRoot: projectRoot ?? undefined, snapshots, onCreateSnapshot, onRefreshSnapshots, hideCreateSnapshot: scope === 'thread' });
  const hasDetailPane = Boolean(panel.selectedSnapshot || panel.comparisonReady);
  return (
    <div className="bg-surface-base text-text-semantic-primary" style={PANEL_STYLE}>
      <TimeTravelControls snapshotCount={panel.sortedSnapshots.length} onClose={onClose} panel={panel} onRefreshSnapshots={onRefreshSnapshots} />
      <div style={BODY_STYLE}>
        <TimeTravelTimelinePane snapshots={panel.sortedSnapshots} hasDetailPane={hasDetailPane} panel={panel} />
        {hasDetailPane && <TimeTravelDetailsPane panel={panel} />}
      </div>
      <TimeTravelRestoreDialog panel={panel} />
    </div>
  );
}
