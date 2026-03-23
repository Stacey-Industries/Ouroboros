/**
 * useContextMenuHandlerHooks.ts — action hooks for context menu handlers.
 * Extracted from useContextMenuController.ts to keep file sizes manageable.
 */

import React, { useCallback } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type { BulkMenuHandlers, ContextMenuHandlers } from './contextMenuControllerHelpers';
import type { TreeNode } from './FileTreeItem';
import { useFileTreeStore } from './fileTreeStore';

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

function useNodeAction(node: TreeNode | null, onClose: () => void, action?: TreeNodeAction): () => void {
  return useCallback(() => {
    if (!node || !action) return;
    action(node);
    onClose();
  }, [action, node, onClose]);
}

function useParentDirectoryAction(node: TreeNode | null, onClose: () => void, action: DirectoryAction): () => void {
  return useCallback(() => {
    if (!node) return;
    onClose();
    action(getParentDirectory(node));
  }, [action, node, onClose]);
}

function useClipboardAction({ message, node, onClose, resolveValue, toast }: {
  message: string; node: TreeNode | null; onClose: () => void;
  resolveValue: (node: TreeNode) => string; toast: ToastFn;
}): () => void {
  return useCallback(() => {
    if (!node) return;
    void navigator.clipboard.writeText(resolveValue(node)).then(() => { toast(message, 'success'); });
    onClose();
  }, [message, node, onClose, resolveValue, toast]);
}

function useOpenInTerminalAction(node: TreeNode | null, onClose: () => void): () => void {
  return useCallback(() => {
    if (!node) return;
    window.dispatchEvent(new CustomEvent('agent-ide:new-terminal', { detail: { cwd: getParentDirectory(node) } }));
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

async function performDeletion(pathsToDelete: string[], nodeName: string, nodePath: string, toast: ToastFn) {
  const undoItems: import('./useFileTreeUndo').UndoItem[] = [];
  const deleted: string[] = [];
  for (const filePath of pathsToDelete) {
    const name = filePath === nodePath ? nodeName : filePath.split(/[\\/]/).pop() ?? filePath;
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

function useDeleteAction(opts: Pick<ContextMenuHandlerOptions, 'confirmingDelete' | 'node' | 'onClose' | 'onDeleted' | 'onMultiDeleted' | 'onPushUndo' | 'selectedPaths' | 'setConfirmingDelete' | 'toast'>): () => void {
  const { confirmingDelete, node, onClose, onDeleted, onMultiDeleted, onPushUndo, selectedPaths, setConfirmingDelete, toast } = opts;
  return useCallback(() => {
    if (!node) return;
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    const combined = selectedPaths && selectedPaths.size > 0 ? new Set([...selectedPaths, node.path]) : new Set([node.path]);
    const pathsToDelete = Array.from(combined);
    void performDeletion(pathsToDelete, node.name, node.path, toast).then(({ deleted, undoItems }) => {
      if (deleted.length === 0) return;
      if (combined.size > 1 && onMultiDeleted) onMultiDeleted(deleted); else onDeleted(node);
      onPushUndo?.(undoItems);
      toast(`Deleted ${deleted.length > 1 ? `${deleted.length} items` : `"${node.name}"`} — Ctrl+Z to undo`, 'success');
    });
    onClose();
  }, [confirmingDelete, node, onClose, onDeleted, onMultiDeleted, onPushUndo, selectedPaths, setConfirmingDelete, toast]);
}

export function useContextMenuHandlers(options: ContextMenuHandlerOptions): ContextMenuHandlers {
  const { node, onBookmarkToggle, onClose, onDeleted, onMultiDeleted, onPushUndo, onNewFile, onNewFolder, onRename, onStage, onUnstage, selectedPaths, setConfirmingDelete, toast, confirmingDelete } = options;
  const handleCopyPath = useClipboardAction({ message: 'Copied path to clipboard', node, onClose, resolveValue: (n) => n.path, toast });
  const handleCopyRelativePath = useClipboardAction({ message: 'Copied relative path to clipboard', node, onClose, resolveValue: (n) => n.relativePath, toast });
  const handleOpenInTerminal = useOpenInTerminalAction(node, onClose);
  const handleRevealInFileManager = useRevealInFileManagerAction(node, onClose);
  const handleBookmarkToggle = useNodeAction(node, onClose, onBookmarkToggle);
  const handleStage = useNodeAction(node, onClose, onStage);
  const handleUnstage = useNodeAction(node, onClose, onUnstage);
  const handleNewFile = useParentDirectoryAction(node, onClose, onNewFile);
  const handleNewFolder = useParentDirectoryAction(node, onClose, onNewFolder);
  const handleRename = useNodeAction(node, onClose, onRename);
  const handleDelete = useDeleteAction({ confirmingDelete, node, onClose, onDeleted, onMultiDeleted, onPushUndo, selectedPaths, setConfirmingDelete, toast });
  return { handleBookmarkToggle, handleCopyPath, handleCopyRelativePath, handleDelete, handleNewFile, handleNewFolder, handleOpenInTerminal, handleRename, handleRevealInFileManager, handleStage, handleUnstage };
}

function useBulkDelete(args: BulkHandlerArgs): () => void {
  const selectedPaths = useFileTreeStore((s) => s.selectedPaths);
  const clearSelection = useFileTreeStore((s) => s.clearSelection);
  const { confirmingDelete, setConfirmingDelete, onClose, onDeleted, toast } = args;

  return useCallback(() => {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    const paths = Array.from(selectedPaths);
    const deduped = paths.filter((p) => !paths.some((o) => o !== p && (p.startsWith(o + '/') || p.startsWith(o + '\\'))));
    void Promise.all(deduped.map((path) => window.electronAPI.files.delete(path))).then((results) => {
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      toast(failed === 0 ? `Deleted ${succeeded} items` : `Deleted ${succeeded}, failed ${failed}`, failed === 0 ? 'success' : 'error');
      for (let i = 0; i < deduped.length; i++) {
        if (results[i].success) onDeleted({ name: deduped[i].split(/[\\/]/).pop() ?? '', path: deduped[i], relativePath: '', isDirectory: false, depth: 0 } as TreeNode);
      }
      clearSelection();
    });
    onClose();
  }, [confirmingDelete, selectedPaths, clearSelection, onClose, onDeleted, setConfirmingDelete, toast]);
}

export function useBulkHandlers(args: BulkHandlerArgs): BulkMenuHandlers {
  const selectedPaths = useFileTreeStore((s) => s.selectedPaths);
  const { onClose, toast, root } = args;
  const handleBulkDelete = useBulkDelete(args);

  const handleBulkCopyPaths = useCallback(() => {
    void navigator.clipboard.writeText(Array.from(selectedPaths).join('\n')).then(() => { toast(`Copied ${selectedPaths.size} paths`, 'success'); });
    onClose();
  }, [selectedPaths, onClose, toast]);

  const handleBulkOpen = useCallback(() => {
    const paths = Array.from(selectedPaths);
    if (paths.length > 20 && !window.confirm(`Open ${paths.length} files? This may slow down the editor.`)) { onClose(); return; }
    for (const path of paths) window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: { path } }));
    onClose();
  }, [selectedPaths, onClose]);

  const handleBulkStage = useCallback(() => {
    const paths = Array.from(selectedPaths);
    void Promise.all(paths.map((p) => { const rel = p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p; return window.electronAPI.git.stage(root, rel); }))
      .then((results) => { toast(`Staged ${results.filter((r) => r.success).length} files`, 'success'); });
    onClose();
  }, [selectedPaths, root, onClose, toast]);

  const handleBulkUnstage = useCallback(() => {
    const paths = Array.from(selectedPaths);
    void Promise.all(paths.map((p) => { const rel = p.startsWith(root) ? p.slice(root.length).replace(/^[\\/]/, '') : p; return window.electronAPI.git.unstage(root, rel); }))
      .then((results) => { toast(`Unstaged ${results.filter((r) => r.success).length} files`, 'success'); });
    onClose();
  }, [selectedPaths, root, onClose, toast]);

  return { handleBulkDelete, handleBulkCopyPaths, handleBulkOpen, handleBulkStage, handleBulkUnstage };
}
