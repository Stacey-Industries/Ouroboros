/**
 * useRootMenuActions.ts — menu action hooks for RootSection.
 * Extracted from useRootSectionInteractions.ts to satisfy the max-lines limit.
 */

import { useCallback } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type { TreeNode } from './FileTreeItem';
import { removeNodeFromTree } from './fileTreeUtils';
import type { UndoItem } from './useFileTreeUndo';
import type { SetRootNodes } from './useRootTreeState';

type ToastFn = ReturnType<typeof useToastContext>['toast'];

async function softDeletePaths(
  pathsToDelete: string[],
  nameMap: Map<string, string>,
  toast: ToastFn,
): Promise<{ deleted: string[]; undoItems: UndoItem[] }> {
  const undoItems: UndoItem[] = [];
  const deleted: string[] = [];
  for (const filePath of pathsToDelete) {
    const name = nameMap.get(filePath) ?? (filePath.replace(/[\\/][^\\/]+$/, '') || filePath);
    const result = await window.electronAPI.files.softDelete?.(filePath);
    if (result?.success && result.tempPath) {
      deleted.push(filePath);
      undoItems.push({ tempPath: result.tempPath, originalPath: filePath, name });
    } else {
      toast(`Failed to delete: ${result?.error ?? 'unknown error'}`, 'error');
    }
  }
  return { deleted, undoItems };
}

function useDeleteFocused(
  toast: ToastFn,
  setRootNodes: SetRootNodes,
  pushUndo: (items: UndoItem[]) => void,
) {
  return useCallback(
    async (node: TreeNode, selectedPaths: Set<string>) => {
      const combinedPaths =
        selectedPaths.size > 0 ? new Set([...selectedPaths, node.path]) : new Set([node.path]);
      const pathsToDelete = Array.from(combinedPaths);
      const nameMap = new Map([[node.path, node.name]]);
      const label = pathsToDelete.length > 1 ? `${pathsToDelete.length} items` : `"${node.name}"`;
      if (!window.confirm(`Delete ${label}? (Ctrl+Z to undo)`)) return;
      const { deleted, undoItems } = await softDeletePaths(pathsToDelete, nameMap, toast);
      if (deleted.length === 0) return;
      setRootNodes((prev) => deleted.reduce((tree, p) => removeNodeFromTree(tree, p), prev));
      pushUndo(undoItems);
      const count = deleted.length;
      toast(
        `Deleted ${count > 1 ? `${count} items` : `"${node.name}"`} — Ctrl+Z to undo`,
        'success',
      );
    },
    [pushUndo, setRootNodes, toast],
  );
}

function useBookmarkToggle(toast: ToastFn): (node: TreeNode) => Promise<void> {
  return useCallback(
    async (node: TreeNode) => {
      const current = ((await window.electronAPI.config.get('bookmarks')) as string[]) ?? [];
      const isBookmarked = current.includes(node.path);
      const updated = isBookmarked
        ? current.filter((path) => path !== node.path)
        : [...current, node.path];
      const result = await window.electronAPI.config.set('bookmarks', updated);
      const msg = result.success
        ? isBookmarked ? `Removed "${node.name}" from Pinned` : `Pinned "${node.name}"`
        : `Bookmark failed: ${result.error}`;
      toast(msg, result.success ? 'success' : 'error');
    },
    [toast],
  );
}

function useGitFileActions(root: string, toast: ToastFn) {
  const handleStage = useCallback(
    async (node: TreeNode) => {
      const result = await window.electronAPI.git.stage(root, node.relativePath);
      toast(
        result.success ? `Staged "${node.name}"` : `Stage failed: ${result.error}`,
        result.success ? 'success' : 'error',
      );
    },
    [root, toast],
  );
  const handleUnstage = useCallback(
    async (node: TreeNode) => {
      const result = await window.electronAPI.git.unstage(root, node.relativePath);
      toast(
        result.success ? `Unstaged "${node.name}"` : `Unstage failed: ${result.error}`,
        result.success ? 'success' : 'error',
      );
    },
    [root, toast],
  );
  return { handleStage, handleUnstage };
}

export function useMenuActions(
  root: string,
  toast: ToastFn,
  setRootNodes: SetRootNodes,
  pushUndo: (items: UndoItem[]) => void,
) {
  const handleDeleted = useCallback(
    (node: TreeNode) => { setRootNodes((prev) => removeNodeFromTree(prev, node.path)); },
    [setRootNodes],
  );
  const handleMultiDeleted = useCallback(
    (paths: string[]) => {
      setRootNodes((prev) => paths.reduce((tree, p) => removeNodeFromTree(tree, p), prev));
    },
    [setRootNodes],
  );
  const handleDeleteFocused = useDeleteFocused(toast, setRootNodes, pushUndo);
  const handleBookmarkToggle = useBookmarkToggle(toast);
  const { handleStage, handleUnstage } = useGitFileActions(root, toast);
  return { handleDeleted, handleMultiDeleted, handleDeleteFocused, handleBookmarkToggle, handleStage, handleUnstage };
}
