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
import { applyNesting } from './fileNestingRules';
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
import { useFileTreeStore } from './fileTreeStore';

/**
 * Like flattenVisibleTree but also includes nested children (from file nesting)
 * when the parent has isNestExpanded set.
 */
function flattenVisibleTreeWithNesting(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    // Directory expansion
    if (node.isDirectory && node.isExpanded && node.children) {
      result.push(...flattenVisibleTreeWithNesting(node.children));
    }
    // File nesting expansion
    if (node.hasNestedChildren && node.isNestExpanded && node.nestedChildren) {
      for (const child of node.nestedChildren) {
        result.push({ ...child, depth: node.depth + 1 });
      }
    }
  }
  return result;
}

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

  const placeholder: TreeNode = {
    name: '',
    path: '__new_item_placeholder__',
    relativePath: '',
    isDirectory: editState.mode === 'newFolder',
    depth: index === -1 ? 0 : base[index].node.depth + 1,
    isExpanded: false,
    isLoading: false,
  };

  // index === -1 means the target is the root directory itself (not in flatRows),
  // so insert the placeholder at the top of the list.
  if (index === -1) {
    return [{ node: placeholder }, ...base];
  }

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

export function useMenuActions(root: string, toast: ToastFn, setRootNodes: SetRootNodes, pushUndo: (items: import('./useFileTreeUndo').UndoItem[]) => void) {
  const handleDeleted = useCallback((node: TreeNode) => {
    setRootNodes((prev) => removeNodeFromTree(prev, node.path));
  }, [setRootNodes]);

  const handleMultiDeleted = useCallback((paths: string[]) => {
    setRootNodes((prev) => paths.reduce((tree, path) => removeNodeFromTree(tree, path), prev));
  }, [setRootNodes]);

  const handleDeleteFocused = useCallback(async (node: TreeNode, selectedPaths: Set<string>) => {
    const combinedPaths = selectedPaths.size > 0
      ? new Set([...selectedPaths, node.path])
      : new Set([node.path]);
    const pathsToDelete = Array.from(combinedPaths);
    const nameMap = new Map<string, string>();
    nameMap.set(node.path, node.name);
    const label = pathsToDelete.length > 1 ? `${pathsToDelete.length} items` : `"${node.name}"`;
    if (!window.confirm(`Delete ${label}? (Ctrl+Z to undo)`)) return;

    const undoItems: import('./useFileTreeUndo').UndoItem[] = [];
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

    if (deleted.length > 0) {
      setRootNodes((prev) => deleted.reduce((tree, p) => removeNodeFromTree(tree, p), prev));
      pushUndo(undoItems);
      toast(`Deleted ${deleted.length > 1 ? `${deleted.length} items` : `"${node.name}"`} — Ctrl+Z to undo`, 'success');
    }
  }, [pushUndo, setRootNodes, toast]);

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

  return { handleDeleted, handleMultiDeleted, handleDeleteFocused, handleBookmarkToggle, handleStage, handleUnstage };
}

/**
 * Apply nestExpandedPaths to tree nodes, setting isNestExpanded on matching paths.
 */
function applyNestExpansionState(nodes: TreeNode[], expandedPaths: Set<string>): TreeNode[] {
  return nodes.map((node) => {
    let updated = node;
    if (node.hasNestedChildren) {
      const isExpanded = expandedPaths.has(node.path);
      if (node.isNestExpanded !== isExpanded) {
        updated = { ...node, isNestExpanded: isExpanded };
      }
    }
    if (updated.isDirectory && updated.children) {
      const newChildren = applyNestExpansionState(updated.children, expandedPaths);
      if (newChildren !== updated.children) {
        updated = { ...updated, children: newChildren };
      }
    }
    return updated;
  });
}

export function useDisplayItems(rootNodes: TreeNode[], editState: EditState | null): Array<{ node: TreeNode }> {
  const nestingEnabled = useFileTreeStore((s) => s.nestingEnabled);
  const nestExpandedPaths = useFileTreeStore((s) => s.nestExpandedPaths);

  const processedNodes = useMemo(() => {
    if (!nestingEnabled) return rootNodes;
    const nested = applyNesting(rootNodes);
    return applyNestExpansionState(nested, nestExpandedPaths);
  }, [rootNodes, nestingEnabled, nestExpandedPaths]);

  const flatRows = useMemo(() => flattenVisibleTreeWithNesting(processedNodes), [processedNodes]);
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
