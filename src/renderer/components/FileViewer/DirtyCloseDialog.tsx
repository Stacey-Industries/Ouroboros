/**
 * DirtyCloseDialog.tsx — Stub component for dirty file close confirmation dialog.
 */

import React from 'react';
import type { DirtyCloseChoice } from './dirtyCloseFlow';

interface DirtyCloseDialogProps {
  fileName: string;
  isOpen: boolean;
  onAction: (choice: DirtyCloseChoice) => void;
}

export function DirtyCloseDialog({
  fileName,
  isOpen,
  onAction,
}: DirtyCloseDialogProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface-base)',
          border: '1px solid var(--border-semantic)',
          borderRadius: '8px',
          padding: '16px',
          minWidth: '300px',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <p className="text-text-semantic-primary" style={{ marginBottom: '12px' }}>
          &quot;{fileName}&quot; has unsaved changes.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={() => onAction('cancel')}>Cancel</button>
          <button onClick={() => onAction('discard')}>Discard</button>
          <button onClick={() => onAction('save')}>Save</button>
        </div>
      </div>
    </div>
  );
}
