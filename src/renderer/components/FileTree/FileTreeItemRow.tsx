import React from 'react';

import type { FileTreeItemProps, TreeNode } from './FileTreeItem';

export interface TreeItemDragHandlers {
  isDragOver: boolean;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface FileTreeItemRowProps {
  node: TreeNode;
  depth: number;
  isActive: boolean;
  isEditing?: boolean;
  backgroundColor: string;
  heatTitle?: string;
  drag: TreeItemDragHandlers;
  onClick: FileTreeItemProps['onClick'];
  onDoubleClick?: FileTreeItemProps['onDoubleClick'];
  onContextMenu?: FileTreeItemProps['onContextMenu'];
  children: React.ReactNode;
}

function rowStyle(
  depth: number,
  backgroundColor: string,
  isDragOver: boolean,
  isActive: boolean,
): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    paddingLeft: `${depth * 16 + 4}px`,
    paddingRight: '8px',
    cursor: 'pointer',
    backgroundColor,
    outline: isDragOver ? '1px dashed var(--interactive-accent)' : undefined,
    borderLeft: isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent',
    userSelect: 'none',
    height: '28px',
    boxSizing: 'border-box',
    position: 'relative',
    borderRadius: '4px',
    marginLeft: '2px',
    marginRight: '2px',
    transition: 'background-color 100ms ease',
  };
}

function makeClickHandler(
  isEditing: boolean,
  node: TreeNode,
  onClick: FileTreeItemProps['onClick'],
) {
  return (e: React.MouseEvent) => {
    if (!isEditing) onClick(node, e as React.MouseEvent<HTMLDivElement>);
  };
}

function makeDoubleClickHandler(
  isEditing: boolean,
  node: TreeNode,
  onDoubleClick?: FileTreeItemProps['onDoubleClick'],
) {
  return () => {
    if (!isEditing && onDoubleClick) onDoubleClick(node);
  };
}

function makeContextMenuHandler(
  isEditing: boolean,
  node: TreeNode,
  onContextMenu?: FileTreeItemProps['onContextMenu'],
) {
  return (e: React.MouseEvent) => {
    if (onContextMenu && !isEditing) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e as React.MouseEvent<HTMLDivElement>, node);
    }
  };
}

export function FileTreeItemRow({
  node,
  depth,
  isActive,
  isEditing,
  backgroundColor,
  heatTitle,
  drag,
  onClick,
  onDoubleClick,
  onContextMenu,
  children,
}: FileTreeItemRowProps): React.ReactElement {
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
      onClick={makeClickHandler(isEditing ?? false, node, onClick)}
      onDoubleClick={makeDoubleClickHandler(isEditing ?? false, node, onDoubleClick)}
      onContextMenu={makeContextMenuHandler(isEditing ?? false, node, onContextMenu)}
      title={heatTitle}
      style={rowStyle(depth, backgroundColor, drag.isDragOver, isActive)}
    >
      {children}
    </div>
  );
}
