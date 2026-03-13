import { useGitStatus } from '../../hooks/useGitStatus';
import { useToastContext } from '../../contexts/ToastContext';
import { useRootTreeState } from './useRootTreeState';
import {
  useRootSelection,
  useContextMenuState,
  useRootEditing,
  useDropHandlers,
  useMenuActions,
  useDisplayItems,
  useFocusClamp,
  useRootKeyboard,
} from './useRootSectionInteractions';

interface UseRootSectionModelArgs {
  root: string;
  onFileSelect: (path: string) => void;
  extraIgnorePatterns: string[];
}

function buildKeyboardDeps(args: {
  displayItems: Array<{ node: ReturnType<typeof useRootTreeState>['rootNodes'][number] }>;
  selection: ReturnType<typeof useRootSelection>;
  tree: ReturnType<typeof useRootTreeState>;
  editing: ReturnType<typeof useRootEditing>;
  menuActions: ReturnType<typeof useMenuActions>;
  root: string;
}) {
  return {
    displayItems: args.displayItems,
    focusIndex: args.selection.focusIndex,
    setFocusIndex: args.selection.setFocusIndex,
    handleItemClick: args.selection.handleItemClick,
    toggleFolder: args.tree.toggleFolder,
    handleRename: args.editing.handleRename,
    handleDeleteFocused: args.menuActions.handleDeleteFocused,
    handleNewFile: args.editing.handleNewFile,
    handleNewFolder: args.editing.handleNewFolder,
    editState: args.editing.editState,
    root: args.root,
  };
}

function buildRootSectionResult(args: {
  gitStatus: ReturnType<typeof useGitStatus>['gitStatus'];
  tree: ReturnType<typeof useRootTreeState>;
  selection: ReturnType<typeof useRootSelection>;
  menuState: ReturnType<typeof useContextMenuState>;
  editing: ReturnType<typeof useRootEditing>;
  menuActions: ReturnType<typeof useMenuActions>;
  dropHandlers: ReturnType<typeof useDropHandlers>;
  displayItems: ReturnType<typeof useDisplayItems>;
  onKeyDown: ReturnType<typeof useRootKeyboard>;
}) {
  return {
    gitStatus: args.gitStatus,
    isLoading: args.tree.isLoading,
    error: args.tree.error,
    displayItems: args.displayItems,
    focusIndex: args.selection.focusIndex,
    selectedPaths: args.selection.selectedPaths,
    contextMenu: args.menuState.contextMenu,
    editState: args.editing.editState,
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
    handleDrop: args.dropHandlers.handleDrop,
    handleRootDrop: args.dropHandlers.handleRootDrop,
    handleDeleteFocused: args.menuActions.handleDeleteFocused,
    handleBookmarkToggle: args.menuActions.handleBookmarkToggle,
    handleStage: args.menuActions.handleStage,
    handleUnstage: args.menuActions.handleUnstage,
    onKeyDown: args.onKeyDown,
  };
}

export function useRootSectionModel({ root, onFileSelect, extraIgnorePatterns }: UseRootSectionModelArgs) {
  const { toast } = useToastContext();
  const { gitStatus } = useGitStatus(root);
  const tree = useRootTreeState(root, extraIgnorePatterns);
  const selection = useRootSelection(tree.toggleFolder, onFileSelect);
  const menuState = useContextMenuState();
  const editing = useRootEditing({ rootNodes: tree.rootNodes, toggleFolder: tree.toggleFolder, refreshDir: tree.refreshDir, onFileSelect, toast });
  const displayItems = useDisplayItems(tree.rootNodes, editing.editState);
  const menuActions = useMenuActions(root, toast, tree.setRootNodes);
  const dropHandlers = useDropHandlers(root, toast, tree.refreshDir);

  useFocusClamp(displayItems.length, selection.setFocusIndex);

  const onKeyDown = useRootKeyboard(buildKeyboardDeps({ displayItems, selection, tree, editing, menuActions, root }));
  return buildRootSectionResult({ gitStatus, tree, selection, menuState, editing, menuActions, dropHandlers, displayItems, onKeyDown });
}
