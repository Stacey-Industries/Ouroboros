import React, { useState } from 'react';

import type { FileHeatData } from '../../hooks/useFileHeatMap';
import type { GitFileStatus } from '../../types/electron';
import { FileTreeItemRow } from './FileTreeItemRow';
import { TreeItemDirectory } from './TreeItemDirectory';
import { TreeItemFile } from './TreeItemFile';
import {
  gitStatusColor,
  gitStatusLabel,
  heatDotColor,
  heatTintColor,
  rowBackground,
} from './treeItemHelpers';

export interface FileEntry {
  path: string;
  relativePath: string;
  name: string;
  dir: string;
  size: number;
}

export interface MatchRange {
  start: number;
  end: number;
}

export interface TreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  depth: number;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
  /** File nesting: true when this file has nested children (e.g. .test, .d.ts) */
  hasNestedChildren?: boolean;
  /** File nesting: child files grouped under this parent */
  nestedChildren?: TreeNode[];
  /** File nesting: whether nested children are visible */
  isNestExpanded?: boolean;
}

export interface FlatRow {
  node: TreeNode;
  depth: number;
}

export interface FileTreeItemProps {
  node: TreeNode;
  depth: number;
  isActive: boolean;
  isFocused: boolean;
  searchMode?: boolean;
  matchRanges?: MatchRange[];
  gitStatus?: GitFileStatus;
  isEditing?: boolean;
  editValue?: string;
  onEditConfirm?: (newName: string) => void;
  onEditCancel?: () => void;
  isBookmarked?: boolean;
  isSelected?: boolean;
  heatData?: FileHeatData;
  /** Diagnostic severity for this item (4A) */
  diagnosticSeverity?: 'error' | 'warning' | 'info' | 'hint';
  /** Whether this file has unsaved changes (4C) */
  isDirty?: boolean;
  onClick: (node: TreeNode, e?: React.MouseEvent) => void;
  onDoubleClick?: (node: TreeNode) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
  onDragOver?: (e: React.DragEvent, node: TreeNode) => void;
  onDrop?: (e: React.DragEvent, targetNode: TreeNode) => void;
}

type DragSetter = React.Dispatch<React.SetStateAction<boolean>>;

function IndentGuides({
  depth,
  searchMode,
}: {
  depth: number;
  searchMode?: boolean;
}): React.ReactElement | null {
  if (depth <= 0 || searchMode) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, index) => (
        <span
          key={`guide-${index}`}
          style={{
            position: 'absolute',
            left: `${index * 16 + 12}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            backgroundColor: 'var(--border-subtle)',
            opacity: 0.4,
          }}
        />
      ))}
    </>
  );
}

function startDrag(e: React.DragEvent, node: TreeNode): void {
  e.dataTransfer.setData('text/plain', node.path);
  e.dataTransfer.setData(
    'application/json',
    JSON.stringify({ path: node.path, relativePath: node.relativePath, isDirectory: node.isDirectory, name: node.name }),
  );
  e.dataTransfer.effectAllowed = 'copyMove';
}

function enterDrag(e: React.DragEvent, setIsDragOver: DragSetter): void {
  e.preventDefault();
  setIsDragOver(true);
}

function dragOverNode(
  e: React.DragEvent,
  node: TreeNode,
  onDragOver?: FileTreeItemProps['onDragOver'],
): void {
  e.preventDefault();
  e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
  if (onDragOver) onDragOver(e, node);
}

function leaveDrag(e: React.DragEvent, setIsDragOver: DragSetter): void {
  if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
}

function dropOnNode(
  e: React.DragEvent,
  node: TreeNode,
  setIsDragOver: DragSetter,
  onDrop?: FileTreeItemProps['onDrop'],
): void {
  e.preventDefault();
  e.stopPropagation();
  setIsDragOver(false);
  if (onDrop) onDrop(e, node);
}

function useDragHandlers(
  node: TreeNode,
  isEditing: boolean | undefined,
  onDragOver?: FileTreeItemProps['onDragOver'],
  onDrop?: FileTreeItemProps['onDrop'],
) {
  const [isDragOver, setIsDragOver] = useState(false);

  return {
    isDragOver,
    draggable: !isEditing,
    onDragStart: (e: React.DragEvent) => startDrag(e, node),
    onDragEnter: (e: React.DragEvent) => enterDrag(e, setIsDragOver),
    onDragOver: (e: React.DragEvent) => dragOverNode(e, node, onDragOver),
    onDragLeave: (e: React.DragEvent) => leaveDrag(e, setIsDragOver),
    onDrop: (e: React.DragEvent) => dropOnNode(e, node, setIsDragOver, onDrop),
  };
}

function renderDirectoryItem(
  props: FileTreeItemProps,
  statusColor: string | undefined,
  statusLbl: string | undefined,
  heatDot: string | undefined,
): React.ReactElement {
  return (
    <TreeItemDirectory
      node={props.node}
      isEditing={!!props.isEditing}
      editValue={props.editValue}
      onEditConfirm={props.onEditConfirm}
      onEditCancel={props.onEditCancel}
      statusColor={statusColor}
      statusLbl={statusLbl}
      isBookmarked={props.isBookmarked}
      heatDot={heatDot}
      heatLevel={props.heatData?.heatLevel}
      diagnosticSeverity={props.diagnosticSeverity}
    />
  );
}

function renderTreeItemContent(
  props: FileTreeItemProps,
  statusColor: string | undefined,
  statusLbl: string | undefined,
  heatDot: string | undefined,
): React.ReactElement {
  if (props.node.isDirectory) {
    return renderDirectoryItem(props, statusColor, statusLbl, heatDot);
  }

  return (
    <TreeItemFile
      node={props.node}
      isEditing={!!props.isEditing}
      editValue={props.editValue}
      onEditConfirm={props.onEditConfirm}
      onEditCancel={props.onEditCancel}
      statusColor={statusColor}
      statusLbl={statusLbl}
      searchMode={props.searchMode}
      matchRanges={props.matchRanges}
      heatDot={heatDot}
      heatLevel={props.heatData?.heatLevel}
      diagnosticSeverity={props.diagnosticSeverity}
      isDirty={props.isDirty}
    />
  );
}

export const FileTreeItem = React.memo(function FileTreeItem(
  props: FileTreeItemProps,
): React.ReactElement {
  const { node, depth, isActive, isFocused, isEditing, isSelected, heatData } = props;
  const drag = useDragHandlers(node, isEditing, props.onDragOver, props.onDrop);
  const statusColor = gitStatusColor(props.gitStatus);
  const statusLbl = gitStatusLabel(props.gitStatus);
  const heatDot = heatDotColor(heatData?.heatLevel);
  const backgroundColor = rowBackground({
    isDragOver: drag.isDragOver,
    isActive,
    isSelected: !!isSelected,
    isFocused,
    heatTint: heatTintColor(heatData?.heatLevel),
  });
  const heatTitle = heatData
    ? `${heatData.editCount} edit${heatData.editCount !== 1 ? 's' : ''} this session (${heatData.heatLevel})`
    : undefined;

  return (
    <FileTreeItemRow
      node={node}
      depth={depth}
      isActive={isActive}
      isEditing={isEditing}
      backgroundColor={backgroundColor}
      heatTitle={heatTitle}
      drag={drag}
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
    >
      <IndentGuides depth={depth} searchMode={props.searchMode} />
      {renderTreeItemContent(props, statusColor, statusLbl, heatDot)}
    </FileTreeItemRow>
  );
});
