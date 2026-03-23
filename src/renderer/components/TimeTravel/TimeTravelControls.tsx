import React from 'react';

import { isFailureStatusMessage } from './timeTravelUtils';

interface ControlsPanelState {
  compareMode: boolean;
  compareFromId: string | null;
  compareToId: string | null;
  snapshotLabel: string;
  creatingSnapshot: boolean;
  statusMessage: string | null;
  toggleCompareMode: () => void;
  setSnapshotLabel: (label: string) => void;
  handleCreateSnapshot: () => Promise<void>;
}

function TimeTravelHeader({
  snapshotCount,
  onClose,
}: {
  snapshotCount: number;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div
      className="bg-surface-panel border-b border-border-semantic"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-interactive-accent"
        style={{ flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="6.5" />
        <polyline points="8,4 8,8 11,10" />
      </svg>
      <span style={{ fontSize: '13px', fontWeight: 600, flex: 1 }}>Time Travel</span>
      <span className="text-text-semantic-muted" style={{ fontSize: '11px' }}>
        {snapshotCount} snapshot{snapshotCount !== 1 ? 's' : ''}
      </span>
      <button
        onClick={onClose}
        title="Close"
        className="text-text-semantic-muted"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '4px',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

function TimeTravelToolbar({
  panel,
  onRefreshSnapshots,
}: {
  panel: ControlsPanelState;
  onRefreshSnapshots: () => Promise<void>;
}): React.ReactElement {
  const compareHint = !panel.compareFromId
    ? 'Select FROM snapshot'
    : !panel.compareToId
      ? 'Select TO snapshot'
      : 'Comparing';

  return (
    <div
      className="border-b border-border-semantic"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        flexShrink: 0,
      }}
    >
      <button
        onClick={panel.toggleCompareMode}
        title={panel.compareMode ? 'Exit compare mode' : 'Compare two snapshots'}
        className={`border border-border-semantic ${panel.compareMode ? 'text-interactive-accent' : 'text-text-semantic-secondary'}`}
        style={{
          padding: '4px 10px',
          borderRadius: '4px',
          background: panel.compareMode ? 'rgba(88, 166, 255, 0.12)' : 'transparent',
          cursor: 'pointer',
          fontSize: '11px',
          fontFamily: 'var(--font-ui)',
          fontWeight: panel.compareMode ? 600 : 400,
        }}
      >
        {panel.compareMode ? 'Exit Compare' : 'Compare'}
      </button>
      <button
        onClick={() => void onRefreshSnapshots()}
        title="Refresh snapshots"
        className="border border-border-semantic text-text-semantic-secondary"
        style={{
          padding: '4px 8px',
          borderRadius: '4px',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '11px',
          fontFamily: 'var(--font-ui)',
        }}
      >
        Refresh
      </button>
      {panel.compareMode && (
        <span className="text-text-semantic-muted" style={{ fontSize: '10px', marginLeft: 'auto' }}>
          {compareHint}
        </span>
      )}
    </div>
  );
}

function CreateSnapshotBar({ panel }: { panel: ControlsPanelState }): React.ReactElement {
  return (
    <div
      className="border-b border-border-semantic"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        flexShrink: 0,
      }}
    >
      <input
        type="text"
        placeholder="Snapshot label (optional)"
        value={panel.snapshotLabel}
        onChange={(event) => panel.setSnapshotLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void panel.handleCreateSnapshot();
        }}
        className="bg-surface-base text-text-semantic-primary border border-border-semantic"
        style={{
          flex: 1,
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'var(--font-ui)',
          outline: 'none',
        }}
      />
      <button
        onClick={() => void panel.handleCreateSnapshot()}
        disabled={panel.creatingSnapshot}
        title="Create a manual snapshot of the current state"
        className="text-text-semantic-on-accent"
        style={{
          padding: '4px 10px',
          borderRadius: '4px',
          border: 'none',
          background: 'var(--interactive-accent)',
          cursor: panel.creatingSnapshot ? 'default' : 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: 'var(--font-ui)',
          opacity: panel.creatingSnapshot ? 0.6 : 1,
        }}
      >
        {panel.creatingSnapshot ? 'Creating...' : 'Snapshot'}
      </button>
    </div>
  );
}

function StatusBanner({ statusMessage }: { statusMessage: string }): React.ReactElement {
  const isFailure = isFailureStatusMessage(statusMessage);
  return (
    <div
      className="border-b border-border-semantic"
      style={{
        padding: '6px 14px',
        fontSize: '11px',
        color: isFailure ? 'var(--status-error)' : 'var(--status-success)',
        backgroundColor: isFailure
          ? 'color-mix(in srgb, var(--status-error) 8%, transparent)'
          : 'color-mix(in srgb, var(--status-success) 8%, transparent)',
        flexShrink: 0,
      }}
    >
      {statusMessage}
    </div>
  );
}

export function TimeTravelControls({
  snapshotCount,
  onClose,
  panel,
  onRefreshSnapshots,
}: {
  snapshotCount: number;
  onClose: () => void;
  panel: ControlsPanelState;
  onRefreshSnapshots: () => Promise<void>;
}): React.ReactElement {
  return (
    <>
      <TimeTravelHeader snapshotCount={snapshotCount} onClose={onClose} />
      <TimeTravelToolbar panel={panel} onRefreshSnapshots={onRefreshSnapshots} />
      <CreateSnapshotBar panel={panel} />
      {panel.statusMessage && <StatusBanner statusMessage={panel.statusMessage} />}
    </>
  );
}
