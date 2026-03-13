import type { GitFileStatus } from '../../types/electron';
import type { TreeNode } from './FileTreeItem';
import type { MenuItem } from './useContextMenuController';

export interface ContextMenuHandlers {
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
}

export interface MenuBuilderOptions {
  confirmingDelete: boolean;
  gitStatus?: GitFileStatus;
  handlers: ContextMenuHandlers;
  isBookmarked?: boolean;
  isRoot: boolean;
  onBookmarkToggle?: (node: TreeNode) => void;
  onStage?: (node: TreeNode) => void;
  onUnstage?: (node: TreeNode) => void;
}

function addCreateItems(items: MenuItem[], handlers: ContextMenuHandlers): void {
  items.push({ label: 'New File', shortcut: 'Ctrl+N', action: handlers.handleNewFile });
  items.push({ label: 'New Folder', shortcut: 'Ctrl+Shift+N', action: handlers.handleNewFolder });
}

function addNodeItems(
  items: MenuItem[],
  handlers: ContextMenuHandlers,
  { confirmingDelete, isRoot }: Pick<MenuBuilderOptions, 'confirmingDelete' | 'isRoot'>,
): void {
  if (isRoot) {
    return;
  }

  items.push({ label: 'Rename', shortcut: 'F2', action: handlers.handleRename, separator: true });
  items.push({
    label: confirmingDelete ? 'Confirm Delete?' : 'Delete',
    shortcut: 'Del',
    action: handlers.handleDelete,
    danger: true,
    separator: true,
  });
}

function addClipboardItems(items: MenuItem[], handlers: ContextMenuHandlers): void {
  items.push({ label: 'Copy Path', action: handlers.handleCopyPath, separator: true });
  items.push({ label: 'Copy Relative Path', action: handlers.handleCopyRelativePath });
  items.push({ label: 'Open in Terminal', action: handlers.handleOpenInTerminal, separator: true });
  items.push({ label: 'Reveal in File Manager', action: handlers.handleRevealInFileManager, separator: true });
}

function addBookmarkItem(
  items: MenuItem[],
  handlers: ContextMenuHandlers,
  { isBookmarked, onBookmarkToggle }: Pick<MenuBuilderOptions, 'isBookmarked' | 'onBookmarkToggle'>,
): void {
  if (!onBookmarkToggle) {
    return;
  }

  items.push({
    label: isBookmarked ? 'Remove from Pinned' : 'Pin to Bookmarks',
    action: handlers.handleBookmarkToggle,
  });
}

function addGitItems(
  items: MenuItem[],
  handlers: ContextMenuHandlers,
  { gitStatus, onStage, onUnstage }: Pick<MenuBuilderOptions, 'gitStatus' | 'onStage' | 'onUnstage'>,
): void {
  if (gitStatus && onStage) {
    items.push({ label: 'Stage file', action: handlers.handleStage, separator: true });
  }

  if (gitStatus && onUnstage) {
    items.push({ label: 'Unstage file', action: handlers.handleUnstage, separator: !onStage });
  }
}

export function buildMenuItems({
  confirmingDelete,
  gitStatus,
  handlers,
  isBookmarked,
  isRoot,
  onBookmarkToggle,
  onStage,
  onUnstage,
}: MenuBuilderOptions): MenuItem[] {
  const items: MenuItem[] = [];
  addCreateItems(items, handlers);
  addNodeItems(items, handlers, { confirmingDelete, isRoot });
  addClipboardItems(items, handlers);
  addBookmarkItem(items, handlers, { isBookmarked, onBookmarkToggle });
  addGitItems(items, handlers, { gitStatus, onStage, onUnstage });
  return items;
}
