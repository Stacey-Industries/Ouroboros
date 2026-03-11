import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useToastContext } from '../../contexts/ToastContext';
import type { TreeNode } from './FileTreeItem';
import type { GitFileStatus } from '../../types/electron';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNode | null;
}

export const INITIAL_CONTEXT_MENU: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  node: null,
};

export interface ContextMenuProps {
  state: ContextMenuState;
  projectRoot: string;
  onClose: () => void;
  /** Trigger inline rename mode on the given node */
  onRename: (node: TreeNode) => void;
  /** Trigger new file creation in the given directory */
  onNewFile: (parentDir: string) => void;
  /** Trigger new folder creation in the given directory */
  onNewFolder: (parentDir: string) => void;
  /** Called after a successful delete so the tree can refresh */
  onDeleted: (node: TreeNode) => void;
  /** Whether the node under the menu is currently bookmarked */
  isBookmarked?: boolean;
  /** Toggle bookmark for the node */
  onBookmarkToggle?: (node: TreeNode) => void;
  /** Git status of the node under the menu */
  gitStatus?: GitFileStatus;
  /** Stage the file */
  onStage?: (node: TreeNode) => void;
  /** Unstage the file */
  onUnstage?: (node: TreeNode) => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  separator?: boolean;
  danger?: boolean;
}

/**
 * ContextMenu — positioned overlay for file tree right-click actions.
 */
export function ContextMenu({
  state,
  projectRoot,
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
}: ContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToastContext();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reset delete confirmation when menu closes or node changes
  useEffect(() => {
    setConfirmingDelete(false);
  }, [state.visible, state.node]);

  // Dismiss on click outside
  useEffect(() => {
    if (!state.visible) return;

    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [state.visible, onClose]);

  // Dismiss on Escape
  useEffect(() => {
    if (!state.visible) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [state.visible, onClose]);

  // Dismiss on scroll
  useEffect(() => {
    if (!state.visible) return;

    function handleScroll(): void {
      onClose();
    }

    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, [state.visible, onClose]);

  // Keep menu within viewport bounds
  useEffect(() => {
    if (!state.visible || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = state.x;
    let adjustedY = state.y;

    if (rect.right > vw) {
      adjustedX = vw - rect.width - 4;
    }
    if (rect.bottom > vh) {
      adjustedY = vh - rect.height - 4;
    }

    if (adjustedX !== state.x || adjustedY !== state.y) {
      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [state.visible, state.x, state.y]);

  const handleCopyPath = useCallback(() => {
    if (!state.node) return;
    void navigator.clipboard.writeText(state.node.path).then(() => {
      toast('Copied path to clipboard', 'success');
    });
    onClose();
  }, [state.node, onClose, toast]);

  const handleCopyRelativePath = useCallback(() => {
    if (!state.node) return;
    void navigator.clipboard.writeText(state.node.relativePath).then(() => {
      toast('Copied relative path to clipboard', 'success');
    });
    onClose();
  }, [state.node, onClose, toast]);

  const handleOpenInTerminal = useCallback(() => {
    if (!state.node) return;
    const cwd = state.node.isDirectory
      ? state.node.path
      : state.node.path.replace(/[\\/][^\\/]+$/, '');

    window.dispatchEvent(
      new CustomEvent('agent-ide:new-terminal', { detail: { cwd } })
    );
    onClose();
  }, [state.node, onClose]);

  const handleRevealInFileManager = useCallback(() => {
    if (!state.node) return;
    void window.electronAPI.shell.showItemInFolder(state.node.path);
    onClose();
  }, [state.node, onClose]);

  const handleBookmarkToggle = useCallback(() => {
    if (!state.node || !onBookmarkToggle) return;
    onBookmarkToggle(state.node);
    onClose();
  }, [state.node, onBookmarkToggle, onClose]);

  const handleStage = useCallback(() => {
    if (!state.node || !onStage) return;
    onStage(state.node);
    onClose();
  }, [state.node, onStage, onClose]);

  const handleUnstage = useCallback(() => {
    if (!state.node || !onUnstage) return;
    onUnstage(state.node);
    onClose();
  }, [state.node, onUnstage, onClose]);

  const handleNewFile = useCallback(() => {
    if (!state.node) return;
    const parentDir = state.node.isDirectory
      ? state.node.path
      : state.node.path.replace(/[\\/][^\\/]+$/, '');
    onClose();
    onNewFile(parentDir);
  }, [state.node, onClose, onNewFile]);

  const handleNewFolder = useCallback(() => {
    if (!state.node) return;
    const parentDir = state.node.isDirectory
      ? state.node.path
      : state.node.path.replace(/[\\/][^\\/]+$/, '');
    onClose();
    onNewFolder(parentDir);
  }, [state.node, onClose, onNewFolder]);

  const handleRename = useCallback(() => {
    if (!state.node) return;
    onClose();
    onRename(state.node);
  }, [state.node, onClose, onRename]);

  const handleDelete = useCallback(() => {
    if (!state.node) return;

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    // Confirmed — perform delete
    void (async () => {
      const result = await window.electronAPI.files.delete(state.node!.path);
      if (result.success) {
        toast(`Moved "${state.node!.name}" to trash`, 'success');
        onDeleted(state.node!);
      } else {
        toast(`Failed to delete: ${result.error}`, 'error');
      }
      onClose();
    })();
  }, [state.node, confirmingDelete, onClose, toast, onDeleted]);

  if (!state.visible || !state.node) return null;

  const items: MenuItem[] = [
    { label: 'New File', shortcut: 'Ctrl+N', action: handleNewFile },
    { label: 'New Folder', shortcut: 'Ctrl+Shift+N', action: handleNewFolder },
    { label: 'Rename', shortcut: 'F2', action: handleRename, separator: true },
    {
      label: confirmingDelete ? 'Confirm Delete?' : 'Delete',
      shortcut: 'Del',
      action: handleDelete,
      danger: true,
      separator: true,
    },
    { label: 'Copy Path', action: handleCopyPath, separator: true },
    { label: 'Copy Relative Path', action: handleCopyRelativePath },
    { label: 'Open in Terminal', action: handleOpenInTerminal, separator: true },
    { label: 'Reveal in File Manager', action: handleRevealInFileManager, separator: true },
    ...(onBookmarkToggle
      ? [
          {
            label: isBookmarked ? 'Remove from Pinned' : 'Pin to Bookmarks',
            action: handleBookmarkToggle,
          },
        ]
      : []),
    ...(gitStatus && onStage
      ? [
          {
            label: 'Stage file',
            action: handleStage,
            separator: true,
          },
        ]
      : []),
    ...(gitStatus && onUnstage
      ? [
          {
            label: 'Unstage file',
            action: handleUnstage,
            separator: !gitStatus || !onStage,
          },
        ]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 9999,
        minWidth: '200px',
        padding: '4px 0',
        background: 'var(--bg-secondary, var(--bg))',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
    >
      {items.map((item) => (
        <React.Fragment key={item.label}>
          {item.separator && (
            <div
              style={{
                height: '1px',
                margin: '4px 8px',
                background: 'var(--border-muted, var(--border))',
              }}
            />
          )}
          <div
            role="menuitem"
            tabIndex={-1}
            onClick={item.action}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              color: item.danger
                ? confirmingDelete && item.label === 'Confirm Delete?'
                  ? 'var(--error, #e55)'
                  : 'var(--error, #e55)'
                : 'var(--text)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                item.danger
                  ? 'rgba(255, 80, 80, 0.12)'
                  : 'rgba(var(--accent-rgb, 88, 166, 255), 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--text-faint)',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {item.shortcut}
              </span>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
