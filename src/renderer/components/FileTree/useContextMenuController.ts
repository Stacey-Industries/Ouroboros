import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToastContext } from '../../contexts/ToastContext';
import type { GitFileStatus } from '../../types/electron';
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

function buildMenuItems({
  confirmingDelete,
  gitStatus,
  handleBookmarkToggle,
  handleCopyPath,
  handleCopyRelativePath,
  handleDelete,
  handleNewFile,
  handleNewFolder,
  handleOpenInTerminal,
  handleRename,
  handleRevealInFileManager,
  handleStage,
  handleUnstage,
  isBookmarked,
  isRoot,
  onBookmarkToggle,
  onStage,
  onUnstage,
}: {
  confirmingDelete: boolean;
  gitStatus?: GitFileStatus;
  handleBookmarkToggle: () => void;
  handleCopyPath: () => void;
  handleCopyRelativePath: () => void;
  handleDelete: () => void;
  handleNewFile: () => void;
  handleNewFolder: () => void;
  handleOpenInTerminal: () => void;
  handleRename: () => void;
  handleRevealInFileManager: () => void;
  handleStage: () => void;
  handleUnstage: () => void;
  isBookmarked?: boolean;
  isRoot: boolean;
  onBookmarkToggle?: (node: TreeNode) => void;
  onStage?: (node: TreeNode) => void;
  onUnstage?: (node: TreeNode) => void;
}): MenuItem[] {
  const items: MenuItem[] = [
    { label: 'New File', shortcut: 'Ctrl+N', action: handleNewFile },
    { label: 'New Folder', shortcut: 'Ctrl+Shift+N', action: handleNewFolder },
  ];

  if (!isRoot) {
    items.push({ label: 'Rename', shortcut: 'F2', action: handleRename, separator: true });
    items.push({
      label: confirmingDelete ? 'Confirm Delete?' : 'Delete',
      shortcut: 'Del',
      action: handleDelete,
      danger: true,
      separator: true,
    });
  }

  items.push({ label: 'Copy Path', action: handleCopyPath, separator: true });
  items.push({ label: 'Copy Relative Path', action: handleCopyRelativePath });
  items.push({ label: 'Open in Terminal', action: handleOpenInTerminal, separator: true });
  items.push({ label: 'Reveal in File Manager', action: handleRevealInFileManager, separator: true });

  if (onBookmarkToggle) {
    items.push({
      label: isBookmarked ? 'Remove from Pinned' : 'Pin to Bookmarks',
      action: handleBookmarkToggle,
    });
  }

  if (gitStatus && onStage) {
    items.push({ label: 'Stage file', action: handleStage, separator: true });
  }

  if (gitStatus && onUnstage) {
    items.push({
      label: 'Unstage file',
      action: handleUnstage,
      separator: !onStage,
    });
  }

  return items;
}

export function useContextMenuController({
  state,
  onClose,
  onRename,
  onNewFile,
  onNewFolder,
  onDeleted,
  isBookmarked,
  onBookmarkToggle,
  gitStatus,
  onStage,
  onUnstage,
}: {
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
}): {
  items: MenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
} {
  const { toast } = useToastContext();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConfirmingDelete(false);
  }, [state.node, state.visible]);

  useDismissMenu(menuRef, onClose, state.visible);

  const handleCopyPath = useCallback(() => {
    if (state.node) {
      copyToClipboard(state.node.path, 'Copied path to clipboard', onClose, toast);
    }
  }, [onClose, state.node, toast]);

  const handleCopyRelativePath = useCallback(() => {
    if (state.node) {
      copyToClipboard(state.node.relativePath, 'Copied relative path to clipboard', onClose, toast);
    }
  }, [onClose, state.node, toast]);

  const handleOpenInTerminal = useCallback(() => {
    if (!state.node) {
      return;
    }

    window.dispatchEvent(new CustomEvent('agent-ide:new-terminal', {
      detail: { cwd: getParentDirectory(state.node) },
    }));
    onClose();
  }, [onClose, state.node]);

  const handleRevealInFileManager = useCallback(() => {
    if (state.node) {
      void window.electronAPI.shell.showItemInFolder(state.node.path);
      onClose();
    }
  }, [onClose, state.node]);

  const handleBookmarkToggle = useCallback(() => {
    if (state.node && onBookmarkToggle) {
      onBookmarkToggle(state.node);
      onClose();
    }
  }, [onBookmarkToggle, onClose, state.node]);

  const handleStage = useCallback(() => {
    if (state.node && onStage) {
      onStage(state.node);
      onClose();
    }
  }, [onClose, onStage, state.node]);

  const handleUnstage = useCallback(() => {
    if (state.node && onUnstage) {
      onUnstage(state.node);
      onClose();
    }
  }, [onClose, onUnstage, state.node]);

  const handleNewFile = useCallback(() => {
    if (state.node) {
      onClose();
      onNewFile(getParentDirectory(state.node));
    }
  }, [onClose, onNewFile, state.node]);

  const handleNewFolder = useCallback(() => {
    if (state.node) {
      onClose();
      onNewFolder(getParentDirectory(state.node));
    }
  }, [onClose, onNewFolder, state.node]);

  const handleRename = useCallback(() => {
    if (state.node) {
      onClose();
      onRename(state.node);
    }
  }, [onClose, onRename, state.node]);

  const handleDelete = useCallback(() => {
    if (!state.node) {
      return;
    }

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    void deleteNode(state.node, onClose, onDeleted, toast);
  }, [confirmingDelete, onClose, onDeleted, state.node, toast]);

  const items = useMemo(() => {
    if (!state.node) {
      return [];
    }

    return buildMenuItems({
      confirmingDelete,
      gitStatus,
      handleBookmarkToggle,
      handleCopyPath,
      handleCopyRelativePath,
      handleDelete,
      handleNewFile,
      handleNewFolder,
      handleOpenInTerminal,
      handleRename,
      handleRevealInFileManager,
      handleStage,
      handleUnstage,
      isBookmarked,
      isRoot: state.node.relativePath === '',
      onBookmarkToggle,
      onStage,
      onUnstage,
    });
  }, [
    confirmingDelete,
    gitStatus,
    handleBookmarkToggle,
    handleCopyPath,
    handleCopyRelativePath,
    handleDelete,
    handleNewFile,
    handleNewFolder,
    handleOpenInTerminal,
    handleRename,
    handleRevealInFileManager,
    handleStage,
    handleUnstage,
    isBookmarked,
    onBookmarkToggle,
    onStage,
    onUnstage,
    state.node,
  ]);

  return { items, menuRef };
}
