import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToastContext } from '../../contexts/ToastContext';
import type { GitFileStatus } from '../../types/electron';
import { buildMenuItems, type ContextMenuHandlers, type MenuBuilderOptions } from './contextMenuControllerHelpers';
import type { TreeNode } from './FileTreeItem';
import type { ContextMenuState } from './ContextMenu';

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
  onClose: () => void;
  onRename: (node: TreeNode) => void;
  onNewFile: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onDeleted: (node: TreeNode) => void;
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
): Promise<void> {
  const result = await window.electronAPI.files.delete(node.path);

  if (result.success) {
    toast(`Moved "${node.name}" to trash`, 'success');
    onDeleted(node);
  } else {
    toast(`Failed to delete: ${result.error}`, 'error');
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
  setConfirmingDelete,
  toast,
}: Pick<
  ContextMenuHandlerOptions,
  'confirmingDelete' | 'node' | 'onClose' | 'onDeleted' | 'setConfirmingDelete' | 'toast'
>): () => void {
  return useCallback(() => {
    if (!node) {
      return;
    }

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    void deleteNode(node, onClose, onDeleted, toast);
  }, [confirmingDelete, node, onClose, onDeleted, setConfirmingDelete, toast]);
}

function useContextMenuHandlers(options: ContextMenuHandlerOptions): ContextMenuHandlers {
  const { node, onBookmarkToggle, onClose, onDeleted, onNewFile, onNewFolder, onRename, onStage, onUnstage, setConfirmingDelete, toast, confirmingDelete } = options;
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
  const handleDelete = useDeleteAction({ confirmingDelete, node, onClose, onDeleted, setConfirmingDelete, toast });
  return { handleBookmarkToggle, handleCopyPath, handleCopyRelativePath, handleDelete, handleNewFile, handleNewFolder, handleOpenInTerminal, handleRename, handleRevealInFileManager, handleStage, handleUnstage };
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
  ...options
}: UseContextMenuControllerProps): {
  items: MenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
} {
  const { toast } = useToastContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useDeleteConfirmation(state.node, state.visible);

  useDismissMenu(menuRef, options.onClose, state.visible);

  const handlers = useContextMenuHandlers({
    ...options,
    confirmingDelete,
    node: state.node,
    setConfirmingDelete,
    state,
    toast,
  });
  const items = useMenuItems(state.node, {
    confirmingDelete,
    gitStatus: options.gitStatus,
    handlers,
    isBookmarked: options.isBookmarked,
    onBookmarkToggle: options.onBookmarkToggle,
    onStage: options.onStage,
    onUnstage: options.onUnstage,
  });

  return { items, menuRef };
}
