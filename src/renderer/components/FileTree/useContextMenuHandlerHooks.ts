/**
 * useContextMenuHandlerHooks.ts — action hooks for context menu handlers.
 * Extracted from useContextMenuController.ts to keep file sizes manageable.
 */

import React, { useCallback } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type { ContextMenuHandlers } from './contextMenuControllerHelpers';
import type { TreeNode } from './FileTreeItem';

type ToastFn = ReturnType<typeof useToastContext>['toast'];
type TreeNodeAction = (node: TreeNode) => void;
type DirectoryAction = (parentDir: string) => void;

interface ContextMenuHandlerOptions {
  node: TreeNode | null;
  onClose: () => void;
  onRename: (node: TreeNode) => void;
  onNewFile: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onDeleted: (node: TreeNode) => void;
  onMultiDeleted?: (paths: string[]) => void;
  onPushUndo?: (items: import('./useFileTreeUndo').UndoItem[]) => void;
  selectedPaths?: Set<string>;
  isBookmarked?: boolean;
  onBookmarkToggle?: (node: TreeNode) => void;
  onStage?: (node: TreeNode) => void;
  onUnstage?: (node: TreeNode) => void;
  confirmingDelete: boolean;
  setConfirmingDelete: React.Dispatch<React.SetStateAction<boolean>>;
  toast: ToastFn;
}

export interface BulkHandlerArgs {
  onClose: () => void;
  toast: ToastFn;
  onDeleted: (node: TreeNode) => void;
  root: string;
  confirmingDelete: boolean;
  setConfirmingDelete: React.Dispatch<React.SetStateAction<boolean>>;
}

function getParentDirectory(node: TreeNode): string {
  return node.isDirectory ? node.path : node.path.replace(/[\\/][^\\/]+$/, '');
}

function useNodeAction(
  node: TreeNode | null,
  onClose: () => void,
  action?: TreeNodeAction,
): () => void {
  return useCallback(() => {
    if (!node || !action) return;
    action(node);
    onClose();
  }, [action, node, onClose]);
}

function useParentDirectoryAction(
  node: TreeNode | null,
  onClose: () => void,
  action: DirectoryAction,
): () => void {
  return useCallback(() => {
    if (!node) return;
    onClose();
    action(getParentDirectory(node));
  }, [action, node, onClose]);
}

function useClipboardAction({
  message,
  node,
  onClose,
  resolveValue,
  toast,
}: {
  message: string;
  node: TreeNode | null;
  onClose: () => void;
  resolveValue: (node: TreeNode) => string;
  toast: ToastFn;
}): () => void {
  return useCallback(() => {
    if (!node) return;
    void navigator.clipboard.writeText(resolveValue(node)).then(() => {
      toast(message, 'success');
    });
    onClose();
  }, [message, node, onClose, resolveValue, toast]);
}

function useOpenInTerminalAction(node: TreeNode | null, onClose: () => void): () => void {
  return useCallback(() => {
    if (!node) return;
    window.dispatchEvent(
      new CustomEvent('agent-ide:new-terminal', { detail: { cwd: getParentDirectory(node) } }),
    );
    onClose();
  }, [node, onClose]);
}

function useRevealInFileManagerAction(node: TreeNode | null, onClose: () => void): () => void {
  return useCallback(() => {
    if (!node) return;
    void window.electronAPI.shell.showItemInFolder(node.path);
    onClose();
  }, [node, onClose]);
}

async function performDeletion(
  pathsToDelete: string[],
  nodeName: string,
  nodePath: string,
  toast: ToastFn,
) {
  const undoItems: import('./useFileTreeUndo').UndoItem[] = [];
  const deleted: string[] = [];
  for (const filePath of pathsToDelete) {
    const name = filePath === nodePath ? nodeName : (filePath.split(/[\\/]/).pop() ?? filePath);
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

type DeleteActionOpts = Pick<
  ContextMenuHandlerOptions,
  | 'confirmingDelete'
  | 'node'
  | 'onClose'
  | 'onDeleted'
  | 'onMultiDeleted'
  | 'onPushUndo'
  | 'selectedPaths'
  | 'setConfirmingDelete'
  | 'toast'
>;

function buildCombinedPaths(
  node: TreeNode,
  selectedPaths: Set<string> | undefined,
): Set<string> {
  return selectedPaths && selectedPaths.size > 0
    ? new Set([...selectedPaths, node.path])
    : new Set([node.path]);
}

interface DeletionResultOpts {
  deleted: string[];
  undoItems: import('./useFileTreeUndo').UndoItem[];
  combined: Set<string>;
  node: TreeNode;
  onDeleted: (n: TreeNode) => void;
  onMultiDeleted: ((paths: string[]) => void) | undefined;
  onPushUndo: ((items: import('./useFileTreeUndo').UndoItem[]) => void) | undefined;
  toast: ToastFn;
}

function applyDeletionResult(opts: DeletionResultOpts): void {
  const { deleted, undoItems, combined, node, onDeleted, onMultiDeleted, onPushUndo, toast } = opts;
  if (deleted.length === 0) return;
  if (combined.size > 1 && onMultiDeleted) onMultiDeleted(deleted);
  else onDeleted(node);
  onPushUndo?.(undoItems);
  const label = deleted.length > 1 ? `${deleted.length} items` : `"${node.name}"`;
  toast(`Deleted ${label} — Ctrl+Z to undo`, 'success');
}

function useDeleteAction(opts: DeleteActionOpts): () => void {
  const {
    confirmingDelete, node, onClose, onDeleted, onMultiDeleted,
    onPushUndo, selectedPaths, setConfirmingDelete, toast,
  } = opts;
  return useCallback(() => {
    if (!node) return;
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    const combined = buildCombinedPaths(node, selectedPaths);
    void performDeletion(Array.from(combined), node.name, node.path, toast).then(
      ({ deleted, undoItems }) => {
        applyDeletionResult({
          deleted, undoItems, combined, node,
          onDeleted, onMultiDeleted, onPushUndo, toast,
        });
      },
    );
    onClose();
  }, [
    confirmingDelete, node, onClose, onDeleted, onMultiDeleted,
    onPushUndo, selectedPaths, setConfirmingDelete, toast,
  ]);
}

function useFileActions(
  node: TreeNode | null,
  onClose: () => void,
  opts: Pick<ContextMenuHandlerOptions, 'onNewFile' | 'onNewFolder' | 'onRename' | 'onBookmarkToggle' | 'onStage' | 'onUnstage' | 'toast'>,
) {
  const { onNewFile, onNewFolder, onRename, onBookmarkToggle, onStage, onUnstage, toast } = opts;
  return {
    handleCopyPath: useClipboardAction({ message: 'Copied path to clipboard', node, onClose, resolveValue: (n) => n.path, toast }),
    handleCopyRelativePath: useClipboardAction({ message: 'Copied relative path to clipboard', node, onClose, resolveValue: (n) => n.relativePath, toast }),
    handleOpenInTerminal: useOpenInTerminalAction(node, onClose),
    handleRevealInFileManager: useRevealInFileManagerAction(node, onClose),
    handleBookmarkToggle: useNodeAction(node, onClose, onBookmarkToggle),
    handleStage: useNodeAction(node, onClose, onStage),
    handleUnstage: useNodeAction(node, onClose, onUnstage),
    handleNewFile: useParentDirectoryAction(node, onClose, onNewFile),
    handleNewFolder: useParentDirectoryAction(node, onClose, onNewFolder),
    handleRename: useNodeAction(node, onClose, onRename),
  };
}

export function useContextMenuHandlers(options: ContextMenuHandlerOptions): ContextMenuHandlers {
  const {
    node, onClose, onDeleted, onMultiDeleted, onPushUndo,
    selectedPaths, setConfirmingDelete, toast, confirmingDelete,
  } = options;
  const fileActions = useFileActions(node, onClose, options);
  const handleDelete = useDeleteAction({
    confirmingDelete, node, onClose, onDeleted, onMultiDeleted,
    onPushUndo, selectedPaths, setConfirmingDelete, toast,
  });
  return { ...fileActions, handleDelete };
}

export { useBulkHandlers } from './useContextMenuBulkHooks';
