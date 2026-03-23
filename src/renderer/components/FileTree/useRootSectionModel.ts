import { useCallback } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { useGitStatus } from '../../hooks/useGitStatus';
import type { TreeNode } from './FileTreeItem';
import { useFileTreeUndo } from './useFileTreeUndo';
import {
  useContextMenuState,
  useDisplayItems,
  useDropHandlers,
  useFocusClamp,
  useMenuActions,
  useRootEditing,
  useRootKeyboard,
  useRootSelection,
} from './useRootSectionInteractions';
import { useRootTreeState } from './useRootTreeState';

interface UseRootSectionModelArgs {
  root: string;
  onFileSelect: (path: string) => void;
  /** Called on double-click for files (opens permanent tab). Falls back to onFileSelect if not provided. */
  onFileOpen?: (path: string) => void;
  extraIgnorePatterns: string[];
  enabled?: boolean;
}

function buildKeyboardDeps(args: {
  displayItems: Array<{ node: ReturnType<typeof useRootTreeState>['rootNodes'][number] }>;
  selection: ReturnType<typeof useRootSelection>;
  tree: ReturnType<typeof useRootTreeState>;
  editing: ReturnType<typeof useRootEditing>;
  menuActions: ReturnType<typeof useMenuActions>;
  undo: ReturnType<typeof useFileTreeUndo>;
  root: string;
}) {
  return {
    displayItems: args.displayItems,
    focusIndex: args.selection.focusIndex,
    setFocusIndex: args.selection.setFocusIndex,
    handleItemClick: args.selection.handleItemClick,
    toggleFolder: args.tree.toggleFolder,
    handleRename: args.editing.handleRename,
    handleDeleteFocused: (node: TreeNode) => args.menuActions.handleDeleteFocused(node, args.selection.selectedPaths),
    selectedPaths: args.selection.selectedPaths,
    handleUndo: args.undo.undo,
    handleNewFile: args.editing.handleNewFile,
    handleNewFolder: args.editing.handleNewFolder,
    editState: args.editing.editState,
    root: args.root,
  };
}

type RootSectionArgs = {
  gitStatus: ReturnType<typeof useGitStatus>['gitStatus'];
  tree: ReturnType<typeof useRootTreeState>;
  selection: ReturnType<typeof useRootSelection>;
  menuState: ReturnType<typeof useContextMenuState>;
  editing: ReturnType<typeof useRootEditing>;
  menuActions: ReturnType<typeof useMenuActions>;
  dropHandlers: ReturnType<typeof useDropHandlers>;
  displayItems: ReturnType<typeof useDisplayItems>;
  onKeyDown: ReturnType<typeof useRootKeyboard>;
  undo: ReturnType<typeof useFileTreeUndo>;
};

function buildStateProps(args: RootSectionArgs) {
  return {
    gitStatus: args.gitStatus,
    isLoading: args.tree.isLoading,
    error: args.tree.error,
    displayItems: args.displayItems,
    focusIndex: args.selection.focusIndex,
    selectedPaths: args.selection.selectedPaths,
    contextMenu: args.menuState.contextMenu,
    editState: args.editing.editState,
  };
}

function buildHandlerProps(args: RootSectionArgs) {
  return {
    handleItemClick: args.selection.handleItemClick,
    handleDoubleClick: args.editing.handleDoubleClick,
    handleContextMenu: args.menuState.handleContextMenu,
    closeContextMenu: args.menuState.closeContextMenu,
    handleRename: args.editing.handleRename,
    handleNewFile: args.editing.handleNewFile,
    handleNewFolder: args.editing.handleNewFolder,
    handleEditConfirm: args.editing.handleEditConfirm,
    handleEditCancel: args.editing.handleEditCancel,
    handleDeleted: args.menuActions.handleDeleted,
    handleMultiDeleted: args.menuActions.handleMultiDeleted,
    handleDrop: args.dropHandlers.handleDrop,
    handleRootDrop: args.dropHandlers.handleRootDrop,
    handleDeleteFocused: args.menuActions.handleDeleteFocused,
    handleBookmarkToggle: args.menuActions.handleBookmarkToggle,
    handleStage: args.menuActions.handleStage,
    handleUnstage: args.menuActions.handleUnstage,
    handleUndo: args.undo.undo,
    pushUndo: args.undo.pushUndo,
    onKeyDown: args.onKeyDown,
  };
}

function buildRootSectionResult(args: RootSectionArgs) {
  return { ...buildStateProps(args), ...buildHandlerProps(args) };
}

export function useRootSectionModel({ root, onFileSelect, onFileOpen, extraIgnorePatterns, enabled = true }: UseRootSectionModelArgs) {
  const { toast } = useToastContext();
  const { gitStatus } = useGitStatus(root, { enabled });
  const tree = useRootTreeState(root, extraIgnorePatterns, { enabled });
  const selection = useRootSelection(tree.toggleFolder, onFileSelect);
  const menuState = useContextMenuState();
  const editing = useRootEditing({ rootNodes: tree.rootNodes, toggleFolder: tree.toggleFolder, refreshDir: tree.refreshDir, onFileSelect, toast });
  const displayItems = useDisplayItems(tree.rootNodes, editing.editState);
  const undo = useFileTreeUndo(tree.refreshDir, toast);
  const menuActions = useMenuActions(root, toast, tree.setRootNodes, undo.pushUndo);
  const dropHandlers = useDropHandlers(root, toast, tree.refreshDir);

  // Double-click: for files, open permanent tab; for directories, trigger rename
  const handleDoubleClick = useCallback((node: TreeNode) => {
    if (!node.isDirectory) {
      const opener = onFileOpen ?? onFileSelect;
      opener(node.path);
    } else {
      editing.handleRename(node);
    }
  }, [onFileOpen, onFileSelect, editing]);

  useFocusClamp(displayItems.length, selection.setFocusIndex);

  const onKeyDown = useRootKeyboard(buildKeyboardDeps({ displayItems, selection, tree, editing, menuActions, undo, root }));
  const result = buildRootSectionResult({ gitStatus, tree, selection, menuState, editing, menuActions, dropHandlers, displayItems, onKeyDown, undo });
  // Override handleDoubleClick with our composite handler
  return { ...result, handleDoubleClick };
}
