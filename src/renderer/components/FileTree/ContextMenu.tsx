import React from 'react';
import type { GitFileStatus } from '../../types/electron';
import type { TreeNode } from './FileTreeItem';
import { ContextMenuPanel } from './ContextMenuPanel';
import { useContextMenuController } from './useContextMenuController';

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
  onRename: (node: TreeNode) => void;
  onNewFile: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onDeleted: (node: TreeNode) => void;
  isBookmarked?: boolean;
  onBookmarkToggle?: (node: TreeNode) => void;
  gitStatus?: GitFileStatus;
  onStage?: (node: TreeNode) => void;
  onUnstage?: (node: TreeNode) => void;
}

export function ContextMenu(props: ContextMenuProps): React.ReactElement | null {
  const controller = useContextMenuController(props);

  if (!props.state.visible || !props.state.node) {
    return null;
  }

  return (
    <ContextMenuPanel
      items={controller.items}
      menuRef={controller.menuRef}
      visible={props.state.visible}
      x={props.state.x}
      y={props.state.y}
    />
  );
}
