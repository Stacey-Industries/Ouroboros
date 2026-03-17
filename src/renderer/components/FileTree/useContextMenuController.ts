import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToastContext } from '../../contexts/ToastContext';
import type { GitFileStatus } from '../../types/electron';
import { buildMenuItems, type BulkMenuHandlers, type ContextMenuHandlers, type MenuBuilderOptions } from './contextMenuControllerHelpers';
import type { TreeNode } from './FileTreeItem';
import type { ContextMenuState } from './ContextMenu';
import { useFileTreeStore } from './fileTreeStore';

export interface MenuItem {
  action: () => void;
  danger?: boolean;
  label: string;
  separator?: boolean;
  shortcut?: string;
}

type ToastFn = ReturnType<typeof useToastContext>['toast'];
type TreeNodeAction = (node: TreeNode) => void;
type DirectoryAction = (parentDir: string) => void;

interface UseContextMenuControllerProps {
  state: ContextMenuState;
  projectRoot: string;
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
  gitStatus?: GitFileStatus;
  onStage?: (node: TreeNode) => void;
  onUnstage?: (node: TreeNode) => void;
}

interface ContextMenuHandlerOptions extends UseContextMenuControllerProps {
  confirmingDelete: boolean;
  node: TreeNode | null;
  setConfirmingDelete: React.Dispatch<React.SetStateAction<boolean>>;
  toast: ToastFn;
}

function getParentDirectory(node: TreeNode): string {
  return node.isDirectory
    ? node.path
    : node.path.replace(/[\\/][^\\/]+$/, '');
}

function useDismissMenu(
  menuRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
  visible: boolean,
): void {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuRef, onClose, visible]);
}

function copyToClipboard(value: string, message: string, onClose: () => void, toast: ToastFn): void {
  void navigator.clipboard.writeText(value).then(() => {
    toast(message, 'success');
  });
  onClose();
}

async function deleteNode(
  node: TreeNode,
  onClose: () => void,
  onDeleted: (node: TreeNode) => void,
  toast: ToastFn,
  selectedPaths?: Set<string>,
  onMultiDeleted?: (paths: string[]) => void,
  onPushUndo?: (items: import('./useFileTreeUndo').UndoItem[]) => void,
): Promise<void> {
  const combinedPaths = selectedPaths && selectedPaths.size > 0
    ? new Set([...selectedPaths, node.path])
    : new Set([node.path]);
  const isMultiSelect = combinedPaths.size > 1;
  const pathsToDelete = Array.from(combinedPaths);

  const undoItems: import('./useFileTreeUndo').UndoItem[] = [];
  const deleted: string[] = [];

  for (const filePath of pathsToDelete) {
    const name = filePath === node.path ? node.name : filePath.split(/[\\/]/).pop() ?? filePath;
    const result = await window.electronAPI.files.softDelete?.(filePath);
    if (result?.success && result.tempPath) {
      deleted.push(filePath);
      undoItems.push({ tempPath: result.tempPath, originalPath: filePath, name });
    } else {
      toast(`Failed to delete: ${result?.error ?? 'unknown error'}`, 'error');
    }
  }

  if (deleted.length > 0) {
    if (isMultiSelect && onMultiDeleted) {
      onMultiDeleted(deleted);
    } else {
      onDeleted(node);
    }
    onPushUndo?.(undoItems);
    const label = deleted.length > 1 ? `${deleted.length} items` : `"${node.name}"`;
    toast(`Deleted ${label} — Ctrl+Z to undo`, 'success');
  }

  onClose();
}

function getNodePath(node: TreeNode): string {
  return node.path;
}

function getNodeRelativePath(node: TreeNode): string {
  return node.relativePath;
}

function useDeleteConfirmation(
  node: TreeNode | null,
  visible: boolean,
): readonly [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const state = useState(false);
  const [, setConfirmingDelete] = state;

  useEffect(() => {
    setConfirmingDelete(false);
  }, [node, setConfirmingDelete, visible]);

  return state;
}

function useNodeAction(
  node: TreeNode | null,
  onClose: () => void,
  action?: TreeNodeAction,
): () => void {
  return useCallback(() => {
    if (!node || !action) {
      return;
    }

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
    if (!node) {
      return;
    }

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
    if (!node) {
      return;
    }

    copyToClipboard(resolveValue(node), message, onClose, toast);
  }, [message, node, onClose, resolveValue, toast]);
}

function useOpenInTerminalAction(node: TreeNode | null, onClose: () => void): () => void {
  return useCallback(() => {
    if (!node) {
      return;
    }

    window.dispatchEvent(new CustomEvent('agent-ide:new-terminal', {
      detail: { cwd: getParentDirectory(node) },
    }));
    onClose();
  }, [node, onClose]);
}

function useRevealInFileManagerAction(node: TreeNode | null, onClose: () => void): () => void {
  return useCallback(() => {
    if (!node) {
      return;
    }

    void window.electronAPI.shell.showItemInFolder(node.path);
    onClose();
  }, [node, onClose]);
}

function useDeleteAction({
  confirmingDelete,
  node,
  onClose,
  onDeleted,
  onMultiDeleted,
  onPushUndo,
  selectedPaths,
  setConfirmingDelete,
  toast,
}: Pick<
  ContextMenuHandlerOptions,
  'confirmingDelete' | 'node' | 'onClose' | 'onDeleted' | 'onMultiDeleted' | 'onPushUndo' | 'selectedPaths' | 'setConfirmingDelete' | 'toast'
>): () => void {
  return useCallback(() => {
    if (!node) {
      return;
    }

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    void deleteNode(node, onClose, onDeleted, toast, selectedPaths, onMultiDeleted, onPushUndo);
  }, [confirmingDelete, node, onClose, onDeleted, onMultiDeleted, onPushUndo, selectedPaths, setConfirmingDelete, toast]);
}

function useContextMenuHandlers(options: ContextMenuHandlerOptions): ContextMenuHandlers {
  const { node, onBookmarkToggle, onClose, onDeleted, onMultiDeleted, onPushUndo, onNewFile, onNewFolder, onRename, onStage, onUnstage, selectedPaths, setConfirmingDelete, toast, confirmingDelete } = options;
  const handleCopyPath = useClipboardAction({ message: 'Copied path to clipboard', node, onClose, resolveValue: getNodePath, toast });
  const handleCopyRelativePath = useClipboardAction({ message: 'Copied relative path to clipboard', node, onClose, resolveValue: getNodeRelativePath, toast });
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

function useBulkHandlers(
  onClose: () => void,
  toast: ToastFn,
  onDeleted: (node: TreeNode) => void,
  root: string,
  confirmingDelete: boolean,
  setConfirmingDelete: React.Dispatch<React.SetStateAction<boolean>>,
): BulkMenuHandlers {
  const selectedPaths = useFileTreeStore((s) => s.selectedPaths);
  const clearSelection = useFileTreeStore((s) => s.clearSelection);

  const handleBulkDelete = useCallback(() => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const paths = Array.from(selectedPaths);
    // Deduplicate: if a folder is selected, skip files inside it
    const deduplicated = paths.filter((p) => {
      return !paths.some((other) => other !== p && p.startsWith(other + '/') || p.startsWith(other + '\\'));
    });

    void Promise.all(
      deduplicated.map((path) => window.electronAPI.files.delete(path)),
    ).then((results) => {
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      if (failed === 0) {
        toast(`Deleted ${succeeded} items`, 'success');
      } else {
        toast(`Deleted ${succeeded}, failed ${failed}`, 'error');
      }
      // Remove all deleted items from tree
      for (let i = 0; i < deduplicated.length; i++) {
        if (results[i].success) {
          onDeleted({ name: deduplicated[i].split(/[\\/]/).pop() ?? '', path: deduplicated[i], relativePath: '', isDirectory: false, depth: 0 } as TreeNode);
        }
      }
      clearSelection();
    });
    onClose();
  }, [confirmingDelete, selectedPaths, clearSelection, onClose, onDeleted, setConfirmingDelete, toast]);

  const handleBulkCopyPaths = useCallback(() => {
    const paths = Array.from(selectedPaths).join('\n');
    void navigator.clipboard.writeText(paths).then(() => {
      toast(`Copied ${selectedPaths.size} paths`, 'success');
    });
    onClose();
  }, [selectedPaths, onClose, toast]);

  const handleBulkOpen = useCallback(() => {
    const paths = Array.from(selectedPaths);
    const MAX_OPEN = 20;
    if (paths.length > MAX_OPEN) {
      if (!window.confirm(`Open ${paths.length} files? This may slow down the editor.`)) {
        onClose();
        return;
      }
    }
    // Dispatch open events for each file (non-directories only)
    for (const path of paths) {
      window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: { path } }));
    }
    onClose();
  }, [selectedPaths, onClose]);

  const handleBulkStage = useCallback(() => {
    const paths = Array.from(selectedPaths);
    void Promise.all(
      paths.map((path) => {
        // Extract relative path from full path based on root
        const rel = path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]/, '') : path;
        return window.electronAPI.git.stage(root, rel);
      }),
    ).then((results) => {
      const succeeded = results.filter((r) => r.success).length;
      toast(`Staged ${succeeded} files`, 'success');
    });
    onClose();
  }, [selectedPaths, root, onClose, toast]);

  const handleBulkUnstage = useCallback(() => {
    const paths = Array.from(selectedPaths);
    void Promise.all(
      paths.map((path) => {
        const rel = path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]/, '') : path;
        return window.electronAPI.git.unstage(root, rel);
      }),
    ).then((results) => {
      const succeeded = results.filter((r) => r.success).length;
      toast(`Unstaged ${succeeded} files`, 'success');
    });
    onClose();
  }, [selectedPaths, root, onClose, toast]);

  return { handleBulkDelete, handleBulkCopyPaths, handleBulkOpen, handleBulkStage, handleBulkUnstage };
}

function useMenuItems(
  node: TreeNode | null,
  options: Omit<MenuBuilderOptions, 'isRoot'>,
): MenuItem[] {
  return useMemo(() => {
    if (!node) {
      return [];
    }

    return buildMenuItems({
      ...options,
      isRoot: node.relativePath === '',
    });
  }, [node, options]);
}

export function useContextMenuController({
  state,
  projectRoot,
  ...options
}: UseContextMenuControllerProps): {
  items: MenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
} {
  const { toast } = useToastContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useDeleteConfirmation(state.node, state.visible);
  const selectionCount = useFileTreeStore((s) => s.selectedPaths.size);

  useDismissMenu(menuRef, options.onClose, state.visible);

  const handlers = useContextMenuHandlers({
    ...options,
    confirmingDelete,
    node: state.node,
    setConfirmingDelete,
    state,
    toast,
  });

  const bulkHandlers = useBulkHandlers(
    options.onClose,
    toast,
    options.onDeleted,
    projectRoot,
    confirmingDelete,
    setConfirmingDelete,
  );

  const combinedCount = options.selectedPaths && state.node
    ? new Set([...options.selectedPaths, state.node.path]).size
    : 0;
  const isMultiSelect = combinedCount > 1;

  const items = useMenuItems(state.node, {
    confirmingDelete,
    selectedCount: isMultiSelect ? combinedCount : undefined,
    gitStatus: options.gitStatus,
    handlers,
    isBookmarked: options.isBookmarked,
    onBookmarkToggle: options.onBookmarkToggle,
    onStage: options.onStage,
    onUnstage: options.onUnstage,
    selectionCount,
    bulkHandlers,
  });

  return { items, menuRef };
}
