/**
 * VirtualTreeList — virtualised rendering of a list of FileTreeItem rows.
 *
 * Extracted from RootSection to reduce complexity.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { FileTreeItem } from './FileTreeItem';
import type { TreeNode } from './FileTreeItem';
import type { GitFileStatus } from '../../types/electron';
import type { FileHeatData } from '../../hooks/useFileHeatMap';
import { ITEM_HEIGHT, OVERSCAN, basename, getNodeGitStatus } from './fileTreeUtils';
import type { EditState } from './fileTreeUtils';
import { useFileTreeStore } from './fileTreeStore';
import type { DiagnosticSeverity } from './fileTreeStore';

/** Threshold in px/frame above which we consider the user is scrolling fast. */
const FAST_SCROLL_DELTA = 500;

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
  const lastScrollTopRef = useRef(0);
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const fastScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    const delta = Math.abs(newScrollTop - lastScrollTopRef.current);
    lastScrollTopRef.current = newScrollTop;
    containerHeight.current = e.currentTarget.clientHeight;
    setScrollTop(newScrollTop);

    if (delta > FAST_SCROLL_DELTA) {
      setIsFastScrolling(true);
      // Clear previous timer if any
      if (fastScrollTimerRef.current !== null) {
        clearTimeout(fastScrollTimerRef.current);
      }
      // Fill in skipped items after scroll stops
      fastScrollTimerRef.current = setTimeout(() => {
        setIsFastScrolling(false);
        fastScrollTimerRef.current = null;
      }, 150);
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (fastScrollTimerRef.current !== null) {
        clearTimeout(fastScrollTimerRef.current);
      }
    };
  }, []);

  const totalHeight = props.displayItems.length * ITEM_HEIGHT;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight.current / ITEM_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(props.displayItems.length, visibleStart + visibleCount);

  // During fast scrolling, skip odd-indexed items to reduce render load.
  // We keep track of the original indices so focus/selection highlighting
  // still maps correctly.
  const rawSlice = props.displayItems.slice(visibleStart, visibleEnd);
  const indexedSlice: Array<{ item: { node: TreeNode }; originalIndex: number }> = isFastScrolling
    ? rawSlice
        .map((item, i) => ({ item, originalIndex: visibleStart + i }))
        .filter((_, i) => i % 2 === 0)
    : rawSlice.map((item, i) => ({ item, originalIndex: visibleStart + i }));

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
          {indexedSlice.map(({ item, originalIndex }) => (
            <VirtualRow
              key={item.node.path === '__new_item_placeholder__' ? '__new_item_placeholder__' : item.node.path}
              item={item}
              index={originalIndex}
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

/** Severity priority for directory aggregation */
const DIAG_PRIO: Record<string, number> = { error: 4, warning: 3, info: 2, hint: 1 };

function useDiagnosticSeverity(node: TreeNode): DiagnosticSeverity | undefined {
  return useFileTreeStore((s) => {
    if (!node.isDirectory) {
      return s.diagnostics.get(node.path);
    }
    // Aggregate worst severity from children
    const prefix = node.path.replace(/\\/g, '/') + '/';
    let worst: DiagnosticSeverity | undefined;
    let worstP = 0;
    for (const [fp, sev] of s.diagnostics) {
      if (fp.replace(/\\/g, '/').startsWith(prefix)) {
        const p = DIAG_PRIO[sev] ?? 0;
        if (p > worstP) { worstP = p; worst = sev; }
      }
    }
    return worst;
  });
}

function VirtualRow({ item, index, ...p }: VirtualRowProps): React.ReactElement {
  const { node } = item;
  const isPlaceholder = node.path === '__new_item_placeholder__';
  const isRenaming = p.editState?.mode === 'rename' && p.editState.targetPath === node.path;
  const isEditing = isPlaceholder || isRenaming;
  const nodeGitStatus = getNodeGitStatus(node, p.gitStatus);
  const diagnosticSeverity = useDiagnosticSeverity(node);
  const isDirty = useFileTreeStore((s) => s.dirtyFiles.has(node.path));

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
      diagnosticSeverity={diagnosticSeverity}
      isDirty={isDirty}
      onClick={p.handleItemClick}
      onDoubleClick={p.handleDoubleClick}
      onContextMenu={p.handleContextMenu}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'; }}
      onDrop={isPlaceholder ? undefined : p.handleDrop}
    />
  );
}
