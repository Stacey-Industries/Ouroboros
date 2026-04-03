/**
 * ChangeSummaryBarRestore.tsx — Checkpoint badge and restore confirmation UI
 * for the CompletedChangeSummaryBar.
 */
import React, { useCallback, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { REFRESH_FILE_TREE_EVENT } from '../../hooks/appEventNames';

/* ---------- CheckpointBadge ---------- */

export function CheckpointBadge(): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-1 text-status-info"
      title="Checkpoint captured — you can restore to this point"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="6" />
      </svg>
    </span>
  );
}

/* ---------- RestoreConfirmDialog ---------- */

interface RestoreConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestoreConfirmDialog({
  onConfirm,
  onCancel,
}: RestoreConfirmDialogProps): React.ReactElement {
  return (
    <div className="border-t border-border-semantic bg-surface-inset px-3 py-2 text-[11px]">
      <p className="mb-2 text-text-semantic-primary">
        Restore all files to their state before this agent turn? This cannot be undone.
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded px-2 py-0.5 text-[11px] text-text-semantic-muted hover:text-text-semantic-primary"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded px-2 py-0.5 text-[11px] font-medium text-status-warning hover:text-status-error"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Restore checkpoint
        </button>
      </div>
    </div>
  );
}

/* ---------- useRestoreSnapshot ---------- */

interface UseRestoreSnapshotArgs {
  projectRoot: string;
  snapshotHash: string;
}

export function useRestoreSnapshot({
  projectRoot,
  snapshotHash,
}: UseRestoreSnapshotArgs): {
  isConfirming: boolean;
  isRestoring: boolean;
  startConfirm: () => void;
  cancelConfirm: () => void;
  confirmRestore: () => Promise<void>;
} {
  const { toast } = useToastContext();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const startConfirm = useCallback(() => setIsConfirming(true), []);
  const cancelConfirm = useCallback(() => setIsConfirming(false), []);

  const confirmRestore = useCallback(async () => {
    setIsConfirming(false);
    setIsRestoring(true);
    try {
      const result = await window.electronAPI.git.restoreSnapshot(projectRoot, snapshotHash);
      if (!result.success) {
        toast(result.error ?? 'Restore failed', 'error');
        return;
      }
      window.dispatchEvent(new CustomEvent(REFRESH_FILE_TREE_EVENT));
      const branch = result.branch ? ` (branch: ${result.branch})` : '';
      toast(`Restored to checkpoint${branch}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Restore failed', 'error');
    } finally {
      setIsRestoring(false);
    }
  }, [projectRoot, snapshotHash, toast]);

  return { isConfirming, isRestoring, startConfirm, cancelConfirm, confirmRestore };
}
