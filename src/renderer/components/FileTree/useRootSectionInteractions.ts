import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TreeNode } from './FileTreeItem';
import { INITIAL_CONTEXT_MENU } from './ContextMenu';
import type { ContextMenuState } from './ContextMenu';
import {
  removeNodeFromTree,
  flattenVisibleTree,
  pathJoin,
  parentDir,
} from './fileTreeUtils';
import type { EditState } from './fileTreeUtils';
import {
  handleRenameOp,
  handleNewFileOp,
  handleNewFolderOp,
  handleExternalDrop,
  handleInternalDrop,
} from './rootSectionHandlers';
import { handleTreeKeyDown } from './rootSectionKeys';
import type { RefreshDir, SetRootNodes } from './useRootTreeState';

type ToastFn = (message: string, type: 'success' | 'error') => void;
type SetFocusIndex = Dispatch<SetStateAction<number>>;

interface EditConfirmArgs {
  editState: EditState | null;
  toast: ToastFn;
  refreshDir: RefreshDir;
  onFileSelect: (path: string) => void;
  clearEdit: () => void;
}

interface RootEditingArgs {
  rootNodes: TreeNode[];
  toggleFolder: (node: TreeNode) => Promise<void>;
  refreshDir: RefreshDir;
  onFileSelect: (path: string) => void;
  toast: ToastFn;
}

interface KeyboardDeps {
  displayItems: Array<{ node: TreeNode }>;
  focusIndex: number;
  setFocusIndex: SetFocusIndex;
  handleItemClick: (node: TreeNode, event?: React.MouseEvent) => void;
  toggleFolder: (node: TreeNode) => Promise<void>;
  handleRename: (node: TreeNode) => void;
  handleDeleteFocused: (node: TreeNode) => Promise<void>;
  handleNewFile: (dir: string) => void;
  handleNewFolder: (dir: string) => void;
  editState: EditState | null;
  root: string;
}

function buildDisplayItems(flatRows: TreeNode[], editState: EditState | null): Array<{ node: TreeNode }> {
  const base = flatRows.map((node) => ({ node }));
  if (!editState || editState.mode === 'rename') {
    return base;
  }

  const index = base.findIndex((item) => item.node.path === editState.targetPath);
  if (index === -1) {
    return base;
  }

  const placeholder: TreeNode = {
    name: '',
    path: '__new_item_placeholder__',
    relativePath: '',
    isDirectory: editState.mode === 'newFolder',
    depth: base[index].node.depth + 1,
    isExpanded: false,
    isLoading: false,
  };

  return [...base.slice(0, index + 1), { node: placeholder }, ...base.slice(index + 1)];
}

function toggleSelectedPath(selectedPaths: Set<string>, targetPath: string): Set<string> {
  const next = new Set(selectedPaths);
  if (next.has(targetPath)) next.delete(targetPath);
  else next.add(targetPath);
  return next;
}

function createRenameState(node: TreeNode): EditState {
  return { targetPath: node.path, mode: 'rename', initialValue: node.name };
}

function createPendingState(targetPath: string, mode: 'newFile' | 'newFolder'): EditState {
  return { targetPath, mode, initialValue: '' };
}

function useCreateHandler(
  mode: 'newFile' | 'newFolder',
  rootNodes: TreeNode[],
  toggleFolder: (node: TreeNode) => Promise<void>,
  setEditState: Dispatch<SetStateAction<EditState | null>>,
): (dir: string) => void {
  const openEditor = useCallback((targetPath: string) => {
    setEditState(createPendingState(targetPath, mode));
  }, [mode, setEditState]);

  return useCallback((dir: string) => {
    const dirNode = flattenVisibleTree(rootNodes).find((node) => node.path === dir);
    if (!dirNode?.isDirectory || dirNode.isExpanded) {
      openEditor(dir);
      return;
    }
    void toggleFolder(dirNode).then(() => openEditor(dir));
  }, [openEditor, rootNodes, toggleFolder]);
}

function useEditConfirm({
  editState,
  toast,
  refreshDir,
  onFileSelect,
  clearEdit,
}: EditConfirmArgs): (newName: string) => Promise<void> {
  return useCallback(async (newName: string) => {
    if (!editState) return;
    const deps = { editState, toast, refreshDir, onFileSelect, clearEdit };
    if (editState.mode === 'rename') {
      await handleRenameOp(deps, newName);
      return;
    }
    if (editState.mode === 'newFile') {
      await handleNewFileOp(deps, newName);
      return;
    }
    await handleNewFolderOp(deps, newName);
  }, [clearEdit, editState, onFileSelect, refreshDir, toast]);
}

export function useRootSelection(toggleFolder: (node: TreeNode) => Promise<void>, onFileSelect: (path: string) => void) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);

  const handleItemClick = useCallback((node: TreeNode, event?: React.MouseEvent) => {
    if (event?.ctrlKey || event?.metaKey) {
      setSelectedPaths((prev) => toggleSelectedPath(prev, node.path));
      return;
    }

    setSelectedPaths(new Set());
    if (node.isDirectory) void toggleFolder(node);
    else onFileSelect(node.path);
  }, [onFileSelect, toggleFolder]);

  return { selectedPaths, focusIndex, setFocusIndex, handleItemClick };
}

export function useContextMenuState() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);
  const handleContextMenu = useCallback((event: React.MouseEvent, node: TreeNode) => {
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, node });
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu(INITIAL_CONTEXT_MENU), []);

  return { contextMenu, handleContextMenu, closeContextMenu };
}

export function useRootEditing({
  rootNodes,
  toggleFolder,
  refreshDir,
  onFileSelect,
  toast,
}: RootEditingArgs) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const clearEdit = useCallback(() => setEditState(null), []);
  const handleRename = useCallback((node: TreeNode) => setEditState(createRenameState(node)), []);
  const handleNewFile = useCreateHandler('newFile', rootNodes, toggleFolder, setEditState);
  const handleNewFolder = useCreateHandler('newFolder', rootNodes, toggleFolder, setEditState);
  const handleEditConfirm = useEditConfirm({ editState, toast, refreshDir, onFileSelect, clearEdit });

  return {
    editState,
    handleDoubleClick: handleRename,
    handleRename,
    handleNewFile,
    handleNewFolder,
    handleEditConfirm,
    handleEditCancel: clearEdit,
  };
}

export function useDropHandlers(root: string, toast: ToastFn, refreshDir: RefreshDir) {
  const handleDrop = useCallback(async (event: React.DragEvent, targetNode: TreeNode) => {
    event.preventDefault();
    const destDir = targetNode.isDirectory ? targetNode.path : parentDir(targetNode.path);
    const externalFiles = Array.from(event.dataTransfer.files);
    if (externalFiles.length > 0) {
      await handleExternalDrop(externalFiles, destDir, toast, refreshDir);
      return;
    }
    const sourcePath = event.dataTransfer.getData('text/plain');
    if (sourcePath) await handleInternalDrop(sourcePath, targetNode, toast, refreshDir);
  }, [refreshDir, toast]);

  const handleRootDrop = useCallback((event: React.DragEvent) => {
    const externalFiles = Array.from(event.dataTransfer.files);
    if (externalFiles.length > 0) {
      void handleExternalDrop(externalFiles, root, toast, refreshDir);
      return;
    }

    const sourcePath = event.dataTransfer.getData('text/plain');
    if (!sourcePath) return;
    const name = sourcePath.replace(/\\/g, '/').split('/').pop() ?? sourcePath;
    void window.electronAPI.files.rename(sourcePath, pathJoin(root, name)).then((result) => {
      if (result.success) {
        toast(`Moved "${name}" to root`, 'success');
        void refreshDir(root);
      } else {
        toast(`Move failed: ${result.error}`, 'error');
      }
    });
  }, [refreshDir, root, toast]);

  return { handleDrop, handleRootDrop };
}

export function useMenuActions(root: string, toast: ToastFn, setRootNodes: SetRootNodes) {
  const handleDeleted = useCallback((node: TreeNode) => {
    setRootNodes((prev) => removeNodeFromTree(prev, node.path));
  }, [setRootNodes]);

  const handleDeleteFocused = useCallback(async (node: TreeNode) => {
    if (!window.confirm(`Move "${node.name}" to trash?`)) return;
    const result = await window.electronAPI.files.delete(node.path);
    if (result.success) {
      toast(`Moved "${node.name}" to trash`, 'success');
      setRootNodes((prev) => removeNodeFromTree(prev, node.path));
    } else {
      toast(`Failed to delete: ${result.error}`, 'error');
    }
  }, [setRootNodes, toast]);

  const handleBookmarkToggle = useCallback(async (node: TreeNode) => {
    const current = (await window.electronAPI.config.get('bookmarks') as string[]) ?? [];
    const isBookmarked = current.includes(node.path);
    const updated = isBookmarked ? current.filter((path) => path !== node.path) : [...current, node.path];
    const result = await window.electronAPI.config.set('bookmarks', updated);
    if (result.success) {
      toast(isBookmarked ? `Removed "${node.name}" from Pinned` : `Pinned "${node.name}"`, 'success');
    } else {
      toast(`Bookmark failed: ${result.error}`, 'error');
    }
  }, [toast]);

  const handleStage = useCallback(async (node: TreeNode) => {
    const result = await window.electronAPI.git.stage(root, node.relativePath);
    toast(result.success ? `Staged "${node.name}"` : `Stage failed: ${result.error}`, result.success ? 'success' : 'error');
  }, [root, toast]);

  const handleUnstage = useCallback(async (node: TreeNode) => {
    const result = await window.electronAPI.git.unstage(root, node.relativePath);
    toast(result.success ? `Unstaged "${node.name}"` : `Unstage failed: ${result.error}`, result.success ? 'success' : 'error');
  }, [root, toast]);

  return { handleDeleted, handleDeleteFocused, handleBookmarkToggle, handleStage, handleUnstage };
}

export function useDisplayItems(rootNodes: TreeNode[], editState: EditState | null): Array<{ node: TreeNode }> {
  const flatRows = useMemo(() => flattenVisibleTree(rootNodes), [rootNodes]);
  return useMemo(() => buildDisplayItems(flatRows, editState), [editState, flatRows]);
}

export function useFocusClamp(displayItemCount: number, setFocusIndex: SetFocusIndex): void {
  useEffect(() => {
    setFocusIndex((prev) => Math.min(prev, Math.max(0, displayItemCount - 1)));
  }, [displayItemCount, setFocusIndex]);
}

export function useRootKeyboard(deps: KeyboardDeps): (event: React.KeyboardEvent) => void {
  return useCallback((event: React.KeyboardEvent) => {
    if (deps.editState) return;
    handleTreeKeyDown(event, deps);
  }, [deps]);
}
