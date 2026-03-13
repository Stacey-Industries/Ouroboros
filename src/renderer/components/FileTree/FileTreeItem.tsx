import React, { useState } from 'react';
import type { GitFileStatus } from '../../types/electron';
import type { FileHeatData } from '../../hooks/useFileHeatMap';
import { gitStatusColor, gitStatusLabel, heatTintColor, heatDotColor, rowBackground } from './treeItemHelpers';
import { TreeItemDirectory } from './TreeItemDirectory';
import { TreeItemFile } from './TreeItemFile';

// ─── Types (re-exported for consumers) ────────────────────────────────────────

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
  onClick: (node: TreeNode, e?: React.MouseEvent) => void;
  onDoubleClick?: (node: TreeNode) => void;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
  onDragOver?: (e: React.DragEvent, node: TreeNode) => void;
  onDrop?: (e: React.DragEvent, targetNode: TreeNode) => void;
}

// ─── Indent guides ────────────────────────────────────────────────────────────

function IndentGuides({ depth, searchMode }: { depth: number; searchMode?: boolean }): React.ReactElement | null {
  if (depth <= 0 || searchMode) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span key={`guide-${i}`} style={{ position: 'absolute', left: `${i * 16 + 12}px`, top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border-muted)', opacity: 0.4 }} />
      ))}
    </>
  );
}

// ─── Drag handlers ────────────────────────────────────────────────────────────

function useDragHandlers(node: TreeNode, isEditing: boolean | undefined, onDragOver?: FileTreeItemProps['onDragOver'], onDrop?: FileTreeItemProps['onDrop']) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handlers = {
    isDragOver,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', node.path);
      e.dataTransfer.setData('application/json', JSON.stringify({ path: node.path, isDirectory: node.isDirectory, name: node.name }));
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
      if (onDragOver) onDragOver(e, node);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
      if (onDrop) onDrop(e, node);
    },
    draggable: !isEditing,
  };

  return handlers;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const FileTreeItem = React.memo(function FileTreeItem(props: FileTreeItemProps): React.ReactElement {
  const { node, depth, isActive, isFocused, isEditing, isSelected, heatData } = props;
  const drag = useDragHandlers(node, isEditing, props.onDragOver, props.onDrop);
  const statusColor = gitStatusColor(props.gitStatus);
  const statusLbl = gitStatusLabel(props.gitStatus);
  const heatTint = heatTintColor(heatData?.heatLevel);
  const heatDot = heatDotColor(heatData?.heatLevel);
  const bg = rowBackground({ isDragOver: drag.isDragOver, isActive, isSelected: !!isSelected, isFocused, heatTint });
  const heatTitle = heatData ? `${heatData.editCount} edit${heatData.editCount !== 1 ? 's' : ''} this session (${heatData.heatLevel})` : undefined;

  return (
    <div
      role="option"
      aria-selected={isActive}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnter={drag.onDragEnter}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onClick={(e) => { if (!isEditing) props.onClick(node, e); }}
      onDoubleClick={() => { if (!isEditing && props.onDoubleClick) props.onDoubleClick(node); }}
      onContextMenu={(e) => { if (props.onContextMenu && !isEditing) { e.preventDefault(); e.stopPropagation(); props.onContextMenu(e, node); } }}
      title={heatTitle}
      style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        paddingLeft: `${depth * 16 + 4}px`, paddingRight: '8px',
        cursor: 'pointer', backgroundColor: bg,
        outline: drag.isDragOver ? '1px dashed var(--accent)' : undefined,
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        userSelect: 'none', height: '28px', boxSizing: 'border-box', position: 'relative',
      }}
    >
      <IndentGuides depth={depth} searchMode={props.searchMode} />
      {node.isDirectory ? (
        <TreeItemDirectory node={node} isEditing={!!isEditing} editValue={props.editValue} onEditConfirm={props.onEditConfirm} onEditCancel={props.onEditCancel} statusColor={statusColor} statusLbl={statusLbl} isBookmarked={props.isBookmarked} heatDot={heatDot} heatLevel={heatData?.heatLevel} />
      ) : (
        <TreeItemFile node={node} isEditing={!!isEditing} editValue={props.editValue} onEditConfirm={props.onEditConfirm} onEditCancel={props.onEditCancel} statusColor={statusColor} statusLbl={statusLbl} searchMode={props.searchMode} matchRanges={props.matchRanges} heatDot={heatDot} heatLevel={heatData?.heatLevel} />
      )}
    </div>
  );
});
