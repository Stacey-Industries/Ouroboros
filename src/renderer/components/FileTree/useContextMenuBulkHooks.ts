/**
 * useContextMenuBulkHooks.ts — bulk-operation hooks for context menu.
 * Extracted from useContextMenuHandlerHooks.ts to satisfy the max-lines limit.
 */

import { useCallback } from 'react';

import type { BulkMenuHandlers } from './contextMenuControllerHelpers';
import type { TreeNode } from './FileTreeItem';
import { useFileTreeStore } from './fileTreeStore';
import type { BulkHandlerArgs } from './useContextMenuHandlerHooks';

function deduplicatePaths(paths: string[]): string[] {
  return paths.filter(
    (p) => !paths.some((o) => o !== p && (p.startsWith(o + '/') || p.startsWith(o + '\\'))),
  );
}

function useBulkDelete(args: BulkHandlerArgs): () => void {
  const selectedPaths = useFileTreeStore((s) => s.selectedPaths);
  const clearSelection = useFileTreeStore((s) => s.clearSelection);
  const { confirmingDelete, setConfirmingDelete, onClose, onDeleted, toast } = args;

  return useCallback(() => {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    const deduped = deduplicatePaths(Array.from(selectedPaths));
    void Promise.all(deduped.map((path) => window.electronAPI.files.delete(path))).then(
      (results) => {
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;
        toast(
          failed === 0 ? `Deleted ${succeeded} items` : `Deleted ${succeeded}, failed ${failed}`,
          failed === 0 ? 'success' : 'error',
        );
        for (let i = 0; i < deduped.length; i++) {
          if (results[i].success)
            onDeleted({
              name: deduped[i].split(/[\\/]/).pop() ?? '',
              path: deduped[i], relativePath: '',
              isDirectory: false, depth: 0,
            } as TreeNode);
        }
        clearSelection();
      },
    );
    onClose();
  }, [confirmingDelete, selectedPaths, clearSelection, onClose, onDeleted, setConfirmingDelete, toast]);
}

interface GitOpArgs {
  root: string;
  selectedPaths: Set<string>;
  onClose: () => void;
  toast: BulkHandlerArgs['toast'];
}

function useBulkStageOp(args: GitOpArgs): () => void {
  const { root, selectedPaths, onClose, toast } = args;
  return useCallback(() => {
    const paths = Array.from(selectedPaths);
    void Promise.all(
      paths.map((p) => {
        const rel = p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p;
        return window.electronAPI.git.stage(root, rel);
      }),
    ).then((results) => {
      toast(`Staged ${results.filter((r) => r.success).length} files`, 'success');
    });
    onClose();
  }, [root, selectedPaths, onClose, toast]);
}

function useBulkUnstageOp(args: GitOpArgs): () => void {
  const { root, selectedPaths, onClose, toast } = args;
  return useCallback(() => {
    const paths = Array.from(selectedPaths);
    void Promise.all(
      paths.map((p) => {
        const rel = p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p;
        return window.electronAPI.git.unstage(root, rel);
      }),
    ).then((results) => {
      toast(`Unstaged ${results.filter((r) => r.success).length} files`, 'success');
    });
    onClose();
  }, [root, selectedPaths, onClose, toast]);
}

export function useBulkHandlers(args: BulkHandlerArgs): BulkMenuHandlers {
  const selectedPaths = useFileTreeStore((s) => s.selectedPaths);
  const { onClose, toast, root } = args;
  const handleBulkDelete = useBulkDelete(args);
  const gitOpArgs: GitOpArgs = { root, selectedPaths, onClose, toast };

  const handleBulkCopyPaths = useCallback(() => {
    void navigator.clipboard.writeText(Array.from(selectedPaths).join('\n')).then(() => {
      toast(`Copied ${selectedPaths.size} paths`, 'success');
    });
    onClose();
  }, [selectedPaths, onClose, toast]);

  const handleBulkOpen = useCallback(() => {
    const paths = Array.from(selectedPaths);
    if (paths.length > 20 && !window.confirm(`Open ${paths.length} files? This may slow down the editor.`)) {
      onClose();
      return;
    }
    for (const path of paths)
      window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: { path } }));
    onClose();
  }, [selectedPaths, onClose]);

  return {
    handleBulkDelete,
    handleBulkCopyPaths,
    handleBulkOpen,
    handleBulkStage: useBulkStageOp(gitOpArgs),
    handleBulkUnstage: useBulkUnstageOp(gitOpArgs),
  };
}
