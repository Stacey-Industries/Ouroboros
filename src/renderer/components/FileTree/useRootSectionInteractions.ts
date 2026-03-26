import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type { ContextMenuState } from './ContextMenu';
import { INITIAL_CONTEXT_MENU } from './ContextMenu';
import type { TreeNode } from './FileTreeItem';
import { useFileTreeStore } from './fileTreeStore';
import type { EditState } from './fileTreeUtils';
import {
  flattenVisibleTree,
  parentDir,
  pathJoin,
  removeNodeFromTree,
} from './fileTreeUtils';
import {
  handleExternalDrop,
  handleInternalDrop,
  handleNewFileOp,
  handleNewFolderOp,
  handleRenameOp,
} from './rootSectionHandlers';
import { handleTreeKeyDown } from './rootSectionKeys';
import type { RefreshDir, SetRootNodes } from './useRootTreeState';

type ToastFn = ReturnType<typeof useToastContext>['toast'];
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
  handleDeleteFocused: (node: TreeNode, selectedPaths: Set<string>) => Promise<void>;
  selectedPaths: Set<string>;
  handleUndo: () => void | Promise<void>;
  handleNewFile: (dir: string) => void;
  handleNewFolder: (dir: string) => void;
  editState: EditState | null;
  root: string;
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
  const storeSelect = useFileTreeStore((s) => s.select);
  const selectedPaths = useFileTreeStore((s) => s.selectedPaths);
  const toggleNestExpansion = useFileTreeStore((s) => s.toggleNestExpansion);
  const [focusIndex, setFocusIndex] = useState(0);

  const handleItemClick = useCallback((node: TreeNode, event?: React.MouseEvent) => {
    const ctrl = !!(event?.ctrlKey || event?.metaKey);
    const shift = !!event?.shiftKey;

    // With any modifier, just update selection
    if (ctrl || shift) {
      storeSelect(node.path, { ctrl, shift });
      return;
    }

    // Plain click: clear selection, select item, and perform action
    storeSelect(node.path, { ctrl: false, shift: false });
    if (node.isDirectory) {
      void toggleFolder(node);
    } else {
      onFileSelect(node.path);
      // Toggle nesting expansion for files with nested children (4B)
      if (node.hasNestedChildren) {
        toggleNestExpansion(node.path);
      }
    }
  }, [onFileSelect, storeSelect, toggleFolder, toggleNestExpansion]);

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

type UndoItem = import('./useFileTreeUndo').UndoItem;

async function softDeletePaths(
  pathsToDelete: string[],
  nameMap: Map<string, string>,
  toast: ToastFn,
): Promise<{ deleted: string[]; undoItems: UndoItem[] }> {
  const undoItems: UndoItem[] = [];
  const deleted: string[] = [];
  for (const filePath of pathsToDelete) {
    const name = nameMap.get(filePath) ?? (filePath.replace(/[\\/][^\\/]+$/, '') || filePath);
    const result = await window.electronAPI.files.softDelete?.(filePath);
    if (result?.success && result.tempPath) {
      deleted.push(filePath);
      undoItems.push({ tempPath: result.tempPath, originalPath: filePath, name });
    } else {
      toast(`Failed to delete: ${result?.error ?? 'unknown error'}`, 'error');
    }
  }
  return { deleted, undoItems };
}

function useDeleteFocused(toast: ToastFn, setRootNodes: SetRootNodes, pushUndo: (items: UndoItem[]) => void) {
  return useCallback(async (node: TreeNode, selectedPaths: Set<string>) => {
    const combinedPaths = selectedPaths.size > 0 ? new Set([...selectedPaths, node.path]) : new Set([node.path]);
    const pathsToDelete = Array.from(combinedPaths);
    const nameMap = new Map([[node.path, node.name]]);
    const label = pathsToDelete.length > 1 ? `${pathsToDelete.length} items` : `"${node.name}"`;
    if (!window.confirm(`Delete ${label}? (Ctrl+Z to undo)`)) return;
    const { deleted, undoItems } = await softDeletePaths(pathsToDelete, nameMap, toast);
    if (deleted.length > 0) {
      setRootNodes((prev) => deleted.reduce((tree, p) => removeNodeFromTree(tree, p), prev));
      pushUndo(undoItems);
      toast(`Deleted ${deleted.length > 1 ? `${deleted.length} items` : `"${node.name}"`} — Ctrl+Z to undo`, 'success');
    }
  }, [pushUndo, setRootNodes, toast]);
}

export function useMenuActions(root: string, toast: ToastFn, setRootNodes: SetRootNodes, pushUndo: (items: UndoItem[]) => void) {
  const handleDeleted = useCallback((node: TreeNode) => {
    setRootNodes((prev) => removeNodeFromTree(prev, node.path));
  }, [setRootNodes]);

  const handleMultiDeleted = useCallback((paths: string[]) => {
    setRootNodes((prev) => paths.reduce((tree, path) => removeNodeFromTree(tree, path), prev));
  }, [setRootNodes]);

  const handleDeleteFocused = useDeleteFocused(toast, setRootNodes, pushUndo);

  const handleBookmarkToggle = useCallback(async (node: TreeNode) => {
    const current = (await window.electronAPI.config.get('bookmarks') as string[]) ?? [];
    const isBookmarked = current.includes(node.path);
    const updated = isBookmarked ? current.filter((path) => path !== node.path) : [...current, node.path];
    const result = await window.electronAPI.config.set('bookmarks', updated);
    toast(result.success
      ? (isBookmarked ? `Removed "${node.name}" from Pinned` : `Pinned "${node.name}"`)
      : `Bookmark failed: ${result.error}`,
      result.success ? 'success' : 'error');
  }, [toast]);

  const handleStage = useCallback(async (node: TreeNode) => {
    const result = await window.electronAPI.git.stage(root, node.relativePath);
    toast(result.success ? `Staged "${node.name}"` : `Stage failed: ${result.error}`, result.success ? 'success' : 'error');
  }, [root, toast]);

  const handleUnstage = useCallback(async (node: TreeNode) => {
    const result = await window.electronAPI.git.unstage(root, node.relativePath);
    toast(result.success ? `Unstaged "${node.name}"` : `Unstage failed: ${result.error}`, result.success ? 'success' : 'error');
  }, [root, toast]);

  return { handleDeleted, handleMultiDeleted, handleDeleteFocused, handleBookmarkToggle, handleStage, handleUnstage };
}

export { useDisplayItems } from './useRootDisplayItems';

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
