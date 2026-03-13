/**
 * rootSectionKeys.ts — keyboard navigation handler for RootSection.
 *
 * Extracted to reduce complexity of the main component.
 */

import React from 'react';
import type { TreeNode } from './FileTreeItem';
import { parentDir } from './fileTreeUtils';

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
  handleCreateKeys(e, item, deps);
}

function handleNavKeys(e: React.KeyboardEvent, deps: KeyHandlerDeps): boolean {
  const item = deps.displayItems[deps.focusIndex];

  return (
    handleVerticalNavKeys(e, deps) ||
    handleSelectionKeys(e, item, deps) ||
    handleFolderNavKeys(e, item, deps)
  );
}

function handleVerticalNavKeys(
  e: React.KeyboardEvent,
  deps: KeyHandlerDeps
): boolean {
  const { displayItems, setFocusIndex } = deps;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setFocusIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setFocusIndex((prev) => Math.max(prev - 1, 0));
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
