import React from 'react';
import type { WorkspaceSnapshot } from '../../types/electron';
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

function SnapshotSummary({ snapshot }: { snapshot: WorkspaceSnapshot }): React.ReactElement {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{snapshotTypeLabel(snapshot.type)}</div>
      <div className="text-text-semantic-secondary" style={{ fontSize: '11px', marginBottom: '2px' }}>{snapshot.sessionLabel || `Session ${snapshot.sessionId.slice(0, 8)}`}</div>
      <div className="text-text-semantic-muted" style={{ fontSize: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
}): React.ReactElement {
  const isCurrent = currentHead === snapshot.commitHash;
  const label = restoring ? 'Restoring...' : isCurrent ? 'Current' : 'Restore';

  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
      <button onClick={() => void onRestore(snapshot)} disabled={restoring || isCurrent} title={isCurrent ? 'Already at this commit' : 'Restore workspace to this snapshot'} style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: isCurrent ? 'var(--bg-tertiary)' : '#f85149', color: isCurrent ? 'var(--text-muted)' : '#fff', cursor: isCurrent ? 'default' : 'pointer', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ui)', opacity: restoring ? 0.6 : 1 }}>
        {label}
      </button>
    </div>
  );
}

function ComparisonSummary({
  fromSnapshot,
  toSnapshot,
}: {
  fromSnapshot: WorkspaceSnapshot;
  toSnapshot: WorkspaceSnapshot;
}): React.ReactElement {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Comparison</div>
      <div className="text-text-semantic-secondary" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ padding: '1px 4px', borderRadius: '3px', backgroundColor: '#d29922', color: '#000', fontSize: '9px', fontWeight: 600 }}>FROM</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{truncateHash(fromSnapshot.commitHash)}</span>
        <span className="text-text-semantic-muted">&rarr;</span>
        <span style={{ padding: '1px 4px', borderRadius: '3px', backgroundColor: '#a371f7', color: '#000', fontSize: '9px', fontWeight: 600 }}>TO</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{truncateHash(toSnapshot.commitHash)}</span>
      </div>
    </div>
  );
}

function ChangedFileRow({ file }: { file: ChangedFile }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 6px', borderRadius: '3px', fontSize: '11px' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600, color: statusColor(file.status), width: '12px', textAlign: 'center', flexShrink: 0 }}>{statusIcon(file.status)}</span>
      <span className="text-text-semantic-secondary" style={{ flex: 1, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>{file.path}</span>
      <span style={{ fontSize: '10px', color: '#3fb950', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{file.additions > 0 ? `+${file.additions}` : ''}</span>
      <span style={{ fontSize: '10px', color: '#f85149', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{file.deletions > 0 ? `-${file.deletions}` : ''}</span>
    </div>
  );
}

function ChangedFilesSection({
  loadingFiles,
  changedFiles,
}: {
  loadingFiles: boolean;
  changedFiles: ChangedFile[];
}): React.ReactElement {
  if (loadingFiles) {
    return <div className="text-text-semantic-muted" style={{ fontSize: '11px', padding: '8px 0' }}>Loading...</div>;
  }

  if (changedFiles.length === 0) {
    return <div className="text-text-semantic-muted" style={{ fontSize: '11px', padding: '8px 0' }}>No file changes detected.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {changedFiles.map((file) => <ChangedFileRow key={file.path} file={file} />)}
    </div>
  );
}

function DirtyWarning({ dirtyCount }: { dirtyCount: number }): React.ReactElement | null {
  if (dirtyCount <= 0) return null;

  return (
    <div style={{ padding: '8px 12px', borderRadius: '4px', backgroundColor: 'rgba(210, 153, 34, 0.1)', border: '1px solid rgba(210, 153, 34, 0.3)', fontSize: '11px', color: '#d29922', marginBottom: '12px', lineHeight: '1.5' }}>
      You have {dirtyCount} uncommitted change{dirtyCount !== 1 ? 's' : ''}. They will be stashed before restoring.
      You can recover them later with <code style={{ fontFamily: 'var(--font-mono)' }}>git stash pop</code>.
    </div>
  );
}

function RestoreDialogActions({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
      <button onClick={onCancel} className="text-text-semantic-primary border border-border-semantic" style={{ padding: '6px 16px', borderRadius: '4px', background: 'transparent', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-ui)' }}>
        Cancel
      </button>
      <button onClick={() => void onConfirm()} style={{ padding: '6px 16px', borderRadius: '4px', border: 'none', background: '#f85149', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-ui)' }}>
        Restore
      </button>
    </div>
  );
}

export function RestoreConfirmDialog({
  snapshot,
  dirtyCount,
  onConfirm,
  onCancel,
}: {
  snapshot: WorkspaceSnapshot;
  dirtyCount: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
      <div className="bg-surface-panel border border-border-semantic" style={{ width: '100%', maxWidth: '420px', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', padding: '20px' }}>
        <h3 className="text-text-semantic-primary" style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>Restore Workspace State</h3>
        <p className="text-text-semantic-secondary" style={{ margin: '0 0 8px', fontSize: '12px', lineHeight: '1.5' }}>
          This will restore the workspace to commit <code className="text-interactive-accent" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{truncateHash(snapshot.commitHash)}</code> ({snapshotTypeLabel(snapshot.type)}).
        </p>
        <DirtyWarning dirtyCount={dirtyCount} />
        <RestoreDialogActions onConfirm={onConfirm} onCancel={onCancel} />
      </div>
    </div>
  );
}

export function TimeTravelDetailsPane({ panel }: { panel: DetailsPanelState }): React.ReactElement {
  const activeSnapshot = panel.compareMode ? null : panel.selectedSnapshot;
  const comparison = panel.comparisonReady && panel.compareFromSnapshot && panel.compareToSnapshot
    ? { from: panel.compareFromSnapshot, to: panel.compareToSnapshot }
    : null;

  return (
    <div style={{ width: '45%', overflowY: 'auto', padding: '12px' }}>
      {activeSnapshot && (
        <>
          <SnapshotSummary snapshot={activeSnapshot} />
          <SnapshotActions snapshot={activeSnapshot} currentHead={panel.currentHead} restoring={panel.restoring} onRestore={panel.handleRestoreClick} />
        </>
      )}
      {comparison && <ComparisonSummary fromSnapshot={comparison.from} toSnapshot={comparison.to} />}
      <div className="text-text-semantic-muted" style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Changed Files {panel.changedFiles.length > 0 ? `(${panel.changedFiles.length})` : ''}
      </div>
      <ChangedFilesSection loadingFiles={panel.loadingFiles} changedFiles={panel.changedFiles} />
    </div>
  );
}
