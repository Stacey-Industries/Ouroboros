/**
 * rootSectionKeys.ts — keyboard navigation handler for RootSection.
 *
 * Extracted to reduce complexity of the main component.
 */

import React from 'react';
import type { TreeNode } from './FileTreeItem';
import { parentDir } from './fileTreeUtils';
import { useFileTreeStore } from './fileTreeStore';

/** Number of items to skip for PageUp/PageDown */
const PAGE_SIZE = 20;

interface KeyHandlerDeps {
  displayItems: Array<{ node: TreeNode }>;
  focusIndex: number;
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>;
  handleItemClick: (node: TreeNode) => void;
  toggleFolder: (node: TreeNode) => Promise<void>;
  handleRename: (node: TreeNode) => void;
  handleDeleteFocused: (node: TreeNode) => Promise<void>;
  handleNewFile: (dir: string) => void;
  handleNewFolder: (dir: string) => void;
  root: string;
}

function getFocusedDir(item: { node: TreeNode } | undefined, root: string): string {
  if (!item) return root;
  if (item.node.isDirectory) return item.node.path;
  return parentDir(item.node.path);
}

export function handleTreeKeyDown(e: React.KeyboardEvent, deps: KeyHandlerDeps): void {
  const { displayItems, focusIndex } = deps;
  const item = displayItems[focusIndex];

  if (handleNavKeys(e, deps)) return;
  if (handleActionKeys(e, item, deps)) return;
  if (handleSelectionShortcuts(e, item, deps)) return;
  handleCreateKeys(e, item, deps);
}

function handleNavKeys(e: React.KeyboardEvent, deps: KeyHandlerDeps): boolean {
  const item = deps.displayItems[deps.focusIndex];

  return (
    handleVerticalNavKeys(e, deps) ||
    handleExtendedNavKeys(e, deps) ||
    handleSelectionKeys(e, item, deps) ||
    handleFolderNavKeys(e, item, deps)
  );
}

function handleVerticalNavKeys(
  e: React.KeyboardEvent,
  deps: KeyHandlerDeps
): boolean {
  const { displayItems, focusIndex, setFocusIndex } = deps;
  const store = useFileTreeStore.getState();

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const nextIndex = Math.min(focusIndex + 1, displayItems.length - 1);
    setFocusIndex(nextIndex);

    // Shift+ArrowDown: extend selection downward
    if (e.shiftKey && displayItems[nextIndex]) {
      store.select(displayItems[nextIndex].node.path, { ctrl: true, shift: false });
      // Also ensure the item we're leaving stays selected
      if (displayItems[focusIndex]) {
        const current = displayItems[focusIndex].node.path;
        if (!store.selectedPaths.has(current)) {
          store.toggleSelection(current);
        }
      }
    }
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const nextIndex = Math.max(focusIndex - 1, 0);
    setFocusIndex(nextIndex);

    // Shift+ArrowUp: extend selection upward
    if (e.shiftKey && displayItems[nextIndex]) {
      store.select(displayItems[nextIndex].node.path, { ctrl: true, shift: false });
      if (displayItems[focusIndex]) {
        const current = displayItems[focusIndex].node.path;
        if (!store.selectedPaths.has(current)) {
          store.toggleSelection(current);
        }
      }
    }
    return true;
  }
  return false;
}

function handleExtendedNavKeys(
  e: React.KeyboardEvent,
  deps: KeyHandlerDeps
): boolean {
  const { displayItems, setFocusIndex } = deps;

  // Home: jump to first item
  if (e.key === 'Home') {
    e.preventDefault();
    setFocusIndex(0);
    return true;
  }

  // End: jump to last item
  if (e.key === 'End') {
    e.preventDefault();
    setFocusIndex(Math.max(0, displayItems.length - 1));
    return true;
  }

  // PageUp: jump up by PAGE_SIZE
  if (e.key === 'PageUp') {
    e.preventDefault();
    setFocusIndex((prev) => Math.max(0, prev - PAGE_SIZE));
    return true;
  }

  // PageDown: jump down by PAGE_SIZE
  if (e.key === 'PageDown') {
    e.preventDefault();
    setFocusIndex((prev) => Math.min(displayItems.length - 1, prev + PAGE_SIZE));
    return true;
  }

  // Backspace: navigate to parent directory of focused item
  if (e.key === 'Backspace') {
    e.preventDefault();
    const item = deps.displayItems[deps.focusIndex];
    if (item) {
      const parent = parentDir(item.node.path);
      const parentIdx = displayItems.findIndex((d) => d.node.path === parent);
      if (parentIdx >= 0) {
        setFocusIndex(parentIdx);
      }
    }
    return true;
  }

  return false;
}

function handleSelectionKeys(
  e: React.KeyboardEvent,
  item: { node: TreeNode } | undefined,
  deps: KeyHandlerDeps
): boolean {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (item) deps.handleItemClick(item.node);
    return true;
  }
  if (e.key === 'Escape') {
    // Clear selection and reset focus
    useFileTreeStore.getState().clearSelection();
    deps.setFocusIndex(0);
    return true;
  }
  return false;
}

function handleFolderNavKeys(
  e: React.KeyboardEvent,
  item: { node: TreeNode } | undefined,
  deps: KeyHandlerDeps
): boolean {
  if (e.key === 'ArrowRight' && item?.node.isDirectory && !item.node.isExpanded) {
    e.preventDefault();
    void deps.toggleFolder(item.node);
    return true;
  }
  if (e.key === 'ArrowLeft' && item?.node.isDirectory && item.node.isExpanded) {
    e.preventDefault();
    void deps.toggleFolder(item.node);
    return true;
  }
  return false;
}

function handleSelectionShortcuts(
  e: React.KeyboardEvent,
  item: { node: TreeNode } | undefined,
  deps: KeyHandlerDeps
): boolean {
  const store = useFileTreeStore.getState();

  // Space: toggle selection of focused item without moving focus
  if (e.key === ' ' && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    if (item) {
      store.toggleSelection(item.node.path);
    }
    return true;
  }

  // Ctrl+A: select all visible items
  if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault();
    store.selectAll();
    return true;
  }

  return false;
}

function handleActionKeys(e: React.KeyboardEvent, item: { node: TreeNode } | undefined, deps: KeyHandlerDeps): boolean {
  if (e.key === 'F2') {
    e.preventDefault();
    if (item?.node) deps.handleRename(item.node);
    return true;
  }
  if (e.key === 'Delete') {
    e.preventDefault();
    if (item?.node) void deps.handleDeleteFocused(item.node);
    return true;
  }
  return false;
}

function handleCreateKeys(e: React.KeyboardEvent, item: { node: TreeNode } | undefined, deps: KeyHandlerDeps): void {
  if (e.key === 'n' && e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    deps.handleNewFile(getFocusedDir(item, deps.root));
  } else if (e.key === 'N' && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    deps.handleNewFolder(getFocusedDir(item, deps.root));
  }
}
