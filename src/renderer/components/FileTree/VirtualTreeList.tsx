/**
 * VirtualTreeList — virtualised rendering of a list of FileTreeItem rows.
 *
 * Extracted from RootSection to reduce complexity.
 */

import React, { useRef, useState, useCallback } from 'react';
import { FileTreeItem } from './FileTreeItem';
import type { TreeNode } from './FileTreeItem';
import type { GitFileStatus } from '../../types/electron';
import type { FileHeatData } from '../../hooks/useFileHeatMap';
import { ITEM_HEIGHT, OVERSCAN, basename } from './fileTreeUtils';
import type { EditState } from './fileTreeUtils';

export interface VirtualTreeListProps {
  root: string;
  displayItems: Array<{ node: TreeNode }>;
  activeFilePath: string | null;
  focusIndex: number;
  selectedPaths: Set<string>;
  bookmarks: string[];
  editState: EditState | null;
  gitStatus: Map<string, GitFileStatus>;
  getHeatLevel?: (path: string) => FileHeatData | undefined;
  handleItemClick: (node: TreeNode, e?: React.MouseEvent) => void;
  handleDoubleClick: (node: TreeNode) => void;
  handleContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  handleEditConfirm: (newName: string) => Promise<void>;
  handleEditCancel: () => void;
  handleDrop: (e: React.DragEvent, node: TreeNode) => Promise<void>;
  handleRootDrop: (e: React.DragEvent) => void;
}

export function VirtualTreeList(props: VirtualTreeListProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const containerHeight = useRef(400);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    containerHeight.current = e.currentTarget.clientHeight;
  }, []);

  const totalHeight = props.displayItems.length * ITEM_HEIGHT;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight.current / ITEM_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(props.displayItems.length, visibleStart + visibleCount);
  const visibleSlice = props.displayItems.slice(visibleStart, visibleEnd);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={`Files in ${basename(props.root)}`}
      onScroll={handleScroll}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'; }}
      onDrop={props.handleRootDrop}
      style={{ overflowY: 'auto', overflowX: 'hidden', position: 'relative', maxHeight: '60vh' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: visibleStart * ITEM_HEIGHT, left: 0, right: 0 }}>
          {visibleSlice.map((item, i) => (
            <VirtualRow
              key={item.node.path === '__new_item_placeholder__' ? '__new_item_placeholder__' : item.node.path}
              item={item}
              index={visibleStart + i}
              {...props}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface VirtualRowProps extends VirtualTreeListProps {
  item: { node: TreeNode };
  index: number;
}

function VirtualRow({ item, index, ...p }: VirtualRowProps): React.ReactElement {
  const { node } = item;
  const isPlaceholder = node.path === '__new_item_placeholder__';
  const isRenaming = p.editState?.mode === 'rename' && p.editState.targetPath === node.path;
  const isEditing = isPlaceholder || isRenaming;
  const nodeGitStatus = getNodeGitStatusLocal(node, p.gitStatus);

  return (
    <FileTreeItem
      node={node}
      depth={node.depth}
      isActive={node.path === p.activeFilePath}
      isFocused={index === p.focusIndex}
      isSelected={p.selectedPaths.has(node.path)}
      searchMode={false}
      gitStatus={nodeGitStatus}
      isBookmarked={p.bookmarks.includes(node.path)}
      heatData={p.getHeatLevel ? p.getHeatLevel(node.path) : undefined}
      isEditing={isEditing}
      editValue={isEditing ? p.editState?.initialValue : undefined}
      onEditConfirm={isEditing ? (n: string) => void p.handleEditConfirm(n) : undefined}
      onEditCancel={isEditing ? p.handleEditCancel : undefined}
      onClick={p.handleItemClick}
      onDoubleClick={p.handleDoubleClick}
      onContextMenu={p.handleContextMenu}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'; }}
      onDrop={isPlaceholder ? undefined : p.handleDrop}
    />
  );
}

/** Inline git status lookup (avoids importing from fileTreeUtils to keep deps clear) */
function getNodeGitStatusLocal(node: TreeNode, gitStatusMap: Map<string, GitFileStatus>): GitFileStatus | undefined {
  if (!node.isDirectory) return gitStatusMap.get(node.relativePath);
  const prefix = node.relativePath + '/';
  const PRIO: Record<string, number> = { D: 4, M: 3, A: 2, R: 2, '?': 1 };
  let worst: GitFileStatus | undefined;
  let worstP = 0;
  for (const [fp, st] of gitStatusMap) {
    if (!fp.startsWith(prefix)) continue;
    const p = PRIO[st] ?? 0;
    if (p > worstP) { worstP = p; worst = st as GitFileStatus; }
  }
  return worst;
}
