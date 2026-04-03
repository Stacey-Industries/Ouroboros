import React from 'react';

import type { WorkspaceSnapshot } from '../../types/electron';
import { RestoreConfirmDialog } from './TimeTravelDetails.dialog';
import {
  ChangedFile,
  formatFullDate,
  snapshotTypeLabel,
  statusColor,
  statusIcon,
  truncateHash,
} from './timeTravelUtils';

interface DetailsPanelState {
  selectedSnapshot: WorkspaceSnapshot | null;
  compareMode: boolean;
  compareFromSnapshot: WorkspaceSnapshot | null;
  compareToSnapshot: WorkspaceSnapshot | null;
  comparisonReady: boolean;
  changedFiles: ChangedFile[];
  loadingFiles: boolean;
  currentHead: string | null;
  restoring: boolean;
  handleRestoreClick: (snapshot: WorkspaceSnapshot) => Promise<void>;
}

function SnapshotSummary({ snapshot }: { snapshot: WorkspaceSnapshot }): React.JSX.Element {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
        {snapshotTypeLabel(snapshot.type)}
      </div>
      <div
        className="text-text-semantic-secondary"
        style={{ fontSize: '11px', marginBottom: '2px' }}
      >
        {snapshot.sessionLabel || `Session ${snapshot.sessionId.slice(0, 8)}`}
      </div>
      <div
        className="text-text-semantic-muted"
        style={{ fontSize: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}
      >
        <span style={{ fontFamily: 'var(--font-mono)' }}>{snapshot.commitHash}</span>
        <span>{formatFullDate(snapshot.timestamp)}</span>
      </div>
    </div>
  );
}

function SnapshotActions({
  snapshot,
  currentHead,
  restoring,
  onRestore,
}: {
  snapshot: WorkspaceSnapshot;
  currentHead: string | null;
  restoring: boolean;
  onRestore: (snapshot: WorkspaceSnapshot) => Promise<void>;
}): React.JSX.Element {
  const isCurrent = currentHead === snapshot.commitHash;
  const label = restoring ? 'Restoring...' : isCurrent ? 'Current' : 'Restore';

  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
      <button
        onClick={() => void onRestore(snapshot)}
        disabled={restoring || isCurrent}
        title={isCurrent ? 'Already at this commit' : 'Restore workspace to this snapshot'}
        style={{
          padding: '4px 10px',
          borderRadius: '4px',
          border: 'none',
          background: isCurrent ? 'var(--surface-raised)' : 'var(--status-error)',
          color: isCurrent ? 'var(--text-muted)' : '#fff',
          cursor: isCurrent ? 'default' : 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: 'var(--font-ui)',
          opacity: restoring ? 0.6 : 1,
        }}
      >
        {label}
      </button>
    </div>
  );
}

const COMPARISON_BADGE_STYLE = {
  padding: '1px 4px',
  borderRadius: '3px',
  color: '#000',
  fontSize: '9px',
  fontWeight: 600,
} as const;

function ComparisonSummary({
  fromSnapshot,
  toSnapshot,
}: {
  fromSnapshot: WorkspaceSnapshot;
  toSnapshot: WorkspaceSnapshot;
}): React.JSX.Element {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Comparison</div>
      <div
        className="text-text-semantic-secondary"
        style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <span style={{ ...COMPARISON_BADGE_STYLE, backgroundColor: 'var(--status-warning)' }}>
          FROM
        </span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {truncateHash(fromSnapshot.commitHash)}
        </span>
        <span className="text-text-semantic-muted">&rarr;</span>
        <span style={{ ...COMPARISON_BADGE_STYLE, backgroundColor: 'var(--palette-purple)' }}>
          TO
        </span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {truncateHash(toSnapshot.commitHash)}
        </span>
      </div>
    </div>
  );
}

const CHANGED_FILE_DIFF_STYLE = {
  fontSize: '10px',
  fontFamily: 'var(--font-mono)',
  flexShrink: 0,
} as const;

const FILE_STATUS_ICON_STYLE = (color: string): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 600,
  color,
  width: '12px',
  textAlign: 'center',
  flexShrink: 0,
});
const FILE_PATH_STYLE: React.CSSProperties = {
  flex: 1,
  fontFamily: 'var(--font-mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '11px',
};

function ChangedFileRow({ file }: { file: ChangedFile }): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 6px',
        borderRadius: '3px',
        fontSize: '11px',
      }}
    >
      <span style={FILE_STATUS_ICON_STYLE(statusColor(file.status))}>
        {statusIcon(file.status)}
      </span>
      <span className="text-text-semantic-secondary" style={FILE_PATH_STYLE}>
        {file.path}
      </span>
      <span style={{ ...CHANGED_FILE_DIFF_STYLE, color: 'var(--status-success)' }}>
        {file.additions > 0 ? `+${file.additions}` : ''}
      </span>
      <span style={{ ...CHANGED_FILE_DIFF_STYLE, color: 'var(--status-error)' }}>
        {file.deletions > 0 ? `-${file.deletions}` : ''}
      </span>
    </div>
  );
}

function ChangedFilesSection({
  loadingFiles,
  changedFiles,
}: {
  loadingFiles: boolean;
  changedFiles: ChangedFile[];
}): React.JSX.Element {
  if (loadingFiles) {
    return (
      <div className="text-text-semantic-muted" style={{ fontSize: '11px', padding: '8px 0' }}>
        Loading...
      </div>
    );
  }

  if (changedFiles.length === 0) {
    return (
      <div className="text-text-semantic-muted" style={{ fontSize: '11px', padding: '8px 0' }}>
        No file changes detected.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {changedFiles.map((file) => (
        <ChangedFileRow key={file.path} file={file} />
      ))}
    </div>
  );
}

export { RestoreConfirmDialog };

export function TimeTravelDetailsPane({ panel }: { panel: DetailsPanelState }): React.JSX.Element {
  const activeSnapshot = panel.compareMode ? null : panel.selectedSnapshot;
  const comparison =
    panel.comparisonReady && panel.compareFromSnapshot && panel.compareToSnapshot
      ? { from: panel.compareFromSnapshot, to: panel.compareToSnapshot }
      : null;

  return (
    <div style={{ width: '45%', overflowY: 'auto', padding: '12px' }}>
      {activeSnapshot && (
        <>
          <SnapshotSummary snapshot={activeSnapshot} />
          <SnapshotActions
            snapshot={activeSnapshot}
            currentHead={panel.currentHead}
            restoring={panel.restoring}
            onRestore={panel.handleRestoreClick}
          />
        </>
      )}
      {comparison && (
        <ComparisonSummary fromSnapshot={comparison.from} toSnapshot={comparison.to} />
      )}
      <div
        className="text-text-semantic-muted"
        style={{
          fontSize: '11px',
          fontWeight: 600,
          marginBottom: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Changed Files {panel.changedFiles.length > 0 ? `(${panel.changedFiles.length})` : ''}
      </div>
      <ChangedFilesSection loadingFiles={panel.loadingFiles} changedFiles={panel.changedFiles} />
    </div>
  );
}
