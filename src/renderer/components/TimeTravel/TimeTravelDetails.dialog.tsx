import React from 'react';

import type { WorkspaceSnapshot } from '../../types/electron';
import { snapshotTypeLabel, truncateHash } from './timeTravelUtils';

const DIALOG_BTN_STYLE = {
  padding: '6px 16px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
} as const;

function DirtyWarning({ dirtyCount }: { dirtyCount: number }): React.ReactElement<any> | null {
  if (dirtyCount <= 0) return null;

  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: '4px',
        backgroundColor: 'color-mix(in srgb, var(--status-warning) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)',
        fontSize: '11px',
        color: 'var(--status-warning)',
        marginBottom: '12px',
        lineHeight: '1.5',
      }}
    >
      You have {dirtyCount} uncommitted change{dirtyCount !== 1 ? 's' : ''}. They will be stashed
      before restoring. You can recover them later with{' '}
      <code style={{ fontFamily: 'var(--font-mono)' }}>git stash pop</code>.
    </div>
  );
}

function RestoreDialogActions({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
      <button
        onClick={onCancel}
        className="text-text-semantic-primary border border-border-semantic"
        style={{ ...DIALOG_BTN_STYLE, background: 'transparent' }}
      >
        Cancel
      </button>
      <button
        onClick={() => void onConfirm()}
        style={{
          ...DIALOG_BTN_STYLE,
          border: 'none',
          background: 'var(--status-error)',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        Restore
      </button>
    </div>
  );
}

function RestoreDialogBody({ snapshot }: { snapshot: WorkspaceSnapshot }): React.ReactElement<any> {
  return (
    <p
      className="text-text-semantic-secondary"
      style={{ margin: '0 0 8px', fontSize: '12px', lineHeight: '1.5' }}
    >
      This will restore the workspace to commit{' '}
      <code
        className="text-interactive-accent"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
      >
        {truncateHash(snapshot.commitHash)}
      </code>{' '}
      ({snapshotTypeLabel(snapshot.type)}).
    </p>
  );
}

const DIALOG_OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
};
const DIALOG_PANEL_STYLE: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  borderRadius: '8px',
  overflow: 'hidden',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  padding: '20px',
};

function DialogInner({
  snapshot,
  dirtyCount,
  onConfirm,
  onCancel,
}: {
  snapshot: WorkspaceSnapshot;
  dirtyCount: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}): React.ReactElement<any> {
  return (
    <div className="bg-surface-panel border border-border-semantic" style={DIALOG_PANEL_STYLE}>
      <h3
        className="text-text-semantic-primary"
        style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}
      >
        Restore Workspace State
      </h3>
      <RestoreDialogBody snapshot={snapshot} />
      <DirtyWarning dirtyCount={dirtyCount} />
      <RestoreDialogActions onConfirm={onConfirm} onCancel={onCancel} />
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
}): React.ReactElement<any> {
  return (
    <div style={DIALOG_OVERLAY_STYLE}>
      <DialogInner
        snapshot={snapshot}
        dirtyCount={dirtyCount}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}
