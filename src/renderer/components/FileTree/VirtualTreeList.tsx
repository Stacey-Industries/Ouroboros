/**
 * VirtualTreeList — virtualised rendering of a list of FileTreeItem rows.
 *
 * Extracted from RootSection to reduce complexity.
 */

import React, { useEffect, useRef, useState } from 'react';

import type { FileHeatData } from '../../hooks/useFileHeatMap';
import type { GitFileStatus } from '../../types/electron';
import type { TreeNode } from './FileTreeItem';
import { FileTreeItem } from './FileTreeItem';
import type { DiagnosticSeverity } from './fileTreeStore';
import { useFileTreeStore } from './fileTreeStore';
import type { EditState } from './fileTreeUtils';
import { basename, getNodeGitStatus, ITEM_HEIGHT, OVERSCAN } from './fileTreeUtils';

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

/** Walk up the DOM to find the nearest ancestor with overflow scrolling. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

interface ScrollListenerRefs {
  containerHeight: React.MutableRefObject<number>;
  lastScrollTopRef: React.MutableRefObject<number>;
  fastScrollTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setScrollTop: (v: number) => void;
  setIsFastScrolling: (v: boolean) => void;
}

function attachScrollListeners(scrollEl: HTMLElement, refs: ScrollListenerRefs): () => void {
  const {
    containerHeight,
    lastScrollTopRef,
    fastScrollTimerRef,
    setScrollTop,
    setIsFastScrolling,
  } = refs;
  const handleScroll = () => {
    const newScrollTop = scrollEl.scrollTop;
    const delta = Math.abs(newScrollTop - lastScrollTopRef.current);
    lastScrollTopRef.current = newScrollTop;
    containerHeight.current = scrollEl.clientHeight;
    setScrollTop(newScrollTop);
    if (delta > FAST_SCROLL_DELTA) {
      setIsFastScrolling(true);
      if (fastScrollTimerRef.current !== null) clearTimeout(fastScrollTimerRef.current);
      fastScrollTimerRef.current = setTimeout(() => {
        setIsFastScrolling(false);
        fastScrollTimerRef.current = null;
      }, 150);
    }
  };
  const ro = new ResizeObserver(() => {
    containerHeight.current = scrollEl.clientHeight;
    setScrollTop(scrollEl.scrollTop);
  });
  scrollEl.addEventListener('scroll', handleScroll, { passive: true });
  ro.observe(scrollEl);
  containerHeight.current = scrollEl.clientHeight;
  setScrollTop(scrollEl.scrollTop);
  return () => {
    scrollEl.removeEventListener('scroll', handleScroll);
    ro.disconnect();
  };
}

function useVirtualScroll(listRef: React.RefObject<HTMLDivElement | null>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerHeight = useRef(400);
  const lastScrollTopRef = useRef(0);
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const fastScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const scrollEl = findScrollParent(listEl);
    if (!scrollEl) return;
    const detach = attachScrollListeners(scrollEl, {
      containerHeight,
      lastScrollTopRef,
      fastScrollTimerRef,
      setScrollTop,
      setIsFastScrolling,
    });
    return () => {
      detach();
      if (fastScrollTimerRef.current !== null) clearTimeout(fastScrollTimerRef.current);
    };
  }, [listRef]);

  return { scrollTop, containerHeight, isFastScrolling };
}

function computeVisibleSlice(
  displayItems: VirtualTreeListProps['displayItems'],
  scrollTop: number,
  containerHeight: number,
  isFastScrolling: boolean,
): Array<{ item: { node: TreeNode }; originalIndex: number }> {
  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(displayItems.length, visibleStart + visibleCount);
  const rawSlice = displayItems.slice(visibleStart, visibleEnd);
  const indexed = rawSlice.map((item, i) => ({ item, originalIndex: visibleStart + i }));
  return isFastScrolling ? indexed.filter((_, i) => i % 2 === 0) : indexed;
}

function handleDragOver(e: React.DragEvent): void {
  e.preventDefault();
  e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
}

function rowKey(path: string): string {
  return path === '__new_item_placeholder__' ? '__new_item_placeholder__' : path;
}

export function VirtualTreeList(props: VirtualTreeListProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  const vs = useVirtualScroll(listRef);
  const slice = computeVisibleSlice(
    props.displayItems,
    vs.scrollTop,
    vs.containerHeight.current,
    vs.isFastScrolling,
  );
  const top = (slice[0]?.originalIndex ?? 0) * ITEM_HEIGHT;
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={`Files in ${basename(props.root)}`}
      onDragOver={handleDragOver}
      onDrop={props.handleRootDrop}
      style={{ position: 'relative' }}
    >
      <div style={{ height: props.displayItems.length * ITEM_HEIGHT, position: 'relative' }}>
        <div style={{ position: 'absolute', top, left: 0, right: 0 }}>
          {slice.map(({ item, originalIndex }) => (
            <VirtualRow key={rowKey(item.node.path)} item={item} index={originalIndex} {...props} />
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
        if (p > worstP) {
          worstP = p;
          worst = sev;
        }
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
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
      }}
      onDrop={isPlaceholder ? undefined : p.handleDrop}
    />
  );
}
