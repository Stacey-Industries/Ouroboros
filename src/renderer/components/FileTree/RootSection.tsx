/**
 * RootSection — renders one project root's collapsible file tree.
 *
 * Sub-components and handlers are extracted into separate files.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TreeNode } from './FileTreeItem';
import { ContextMenu, INITIAL_CONTEXT_MENU } from './ContextMenu';
import type { ContextMenuState } from './ContextMenu';
import { FileTreeSkeleton } from '../shared';
import { useGitStatus } from '../../hooks/useGitStatus';
import { useToastContext } from '../../contexts/ToastContext';
import type { FileChangeEvent } from '../../types/electron';
import type { FileHeatData } from '../../hooks/useFileHeatMap';
import type { FileChangeEvent } from '../../types/electron';
import { buildIgnorePredicate, loadDirChildren, normPath, basename, updateNodeInTree, removeNodeFromTree, flattenVisibleTree, getNodeGitStatus, pathJoin, parentDir } from './fileTreeUtils';
import type { EditState } from './fileTreeUtils';
import { handleRenameOp, handleNewFileOp, handleNewFolderOp, handleExternalDrop, handleInternalDrop } from './rootSectionHandlers';
import { handleTreeKeyDown } from './rootSectionKeys';
import { RootSectionHeader } from './RootSectionHeader';
import { VirtualTreeList } from './VirtualTreeList';

export interface RootSectionProps {
  root: string;
  isExpanded: boolean;
  onToggle: () => void;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onRemove?: () => void;
  bookmarks: string[];
  extraIgnorePatterns: string[];
  getHeatLevel?: (filePath: string) => FileHeatData | undefined;
}

export function RootSection({
  root, isExpanded, onToggle, activeFilePath, onFileSelect,
  onRemove, bookmarks, extraIgnorePatterns, getHeatLevel,
}: RootSectionProps): React.ReactElement {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const loadedDirsRef = useRef<Set<string>>(new Set());
  const { toast } = useToastContext();
  const { gitStatus } = useGitStatus(root);
  const shouldIgnore = useMemo(() => buildIgnorePredicate(extraIgnorePatterns), [extraIgnorePatterns]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true); setError(null); loadedDirsRef.current.clear();
    loadDirChildren(root, root, 0, shouldIgnore)
      .then((nodes) => { if (!cancelled) { setRootNodes(nodes); loadedDirsRef.current.add(normPath(root)); } })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [root, shouldIgnore]);

  // File watcher
  const refreshDirRef = useRef<((d: string) => Promise<void>) | null>(null);
  useFileWatcher(root, loadedDirsRef, refreshDirRef);

  const refreshDir = useCallback(async (dirPath: string) => {
    if (normPath(dirPath) === normPath(root)) {
      loadedDirsRef.current.clear();
      const children = await loadDirChildren(root, root, 0, shouldIgnore);
      loadedDirsRef.current.add(normPath(root));
      setRootNodes(children);
      return;
    }
    const flatRows = flattenVisibleTree(rootNodes);
    const dirNode = flatRows.find((n) => n.path === dirPath);
    const depth = dirNode ? dirNode.depth : 0;
    const children = await loadDirChildren(root, dirPath, depth + 1, shouldIgnore);
    loadedDirsRef.current.add(normPath(dirPath));
    setRootNodes((prev) => updateNodeInTree(prev, dirPath, (n) => ({ ...n, children, isExpanded: true, isLoading: false })));
  }, [root, rootNodes, shouldIgnore]);

  useEffect(() => { refreshDirRef.current = refreshDir; }, [refreshDir]);

  const toggleFolder = useCallback(async (node: TreeNode) => {
    if (!node.isDirectory) return;
    if (node.isExpanded) {
      setRootNodes((prev) => updateNodeInTree(prev, node.path, (n) => ({ ...n, isExpanded: false })));
      return;
    }
    if (node.children === undefined) {
      setRootNodes((prev) => updateNodeInTree(prev, node.path, (n) => ({ ...n, isExpanded: true, isLoading: true })));
      try {
        const children = await loadDirChildren(root, node.path, node.depth + 1, shouldIgnore);
        loadedDirsRef.current.add(normPath(node.path));
        setRootNodes((prev) => updateNodeInTree(prev, node.path, (n) => ({ ...n, children, isExpanded: true, isLoading: false })));
      } catch {
        setRootNodes((prev) => updateNodeInTree(prev, node.path, (n) => ({ ...n, children: [], isExpanded: true, isLoading: false })));
      }
    } else {
      setRootNodes((prev) => updateNodeInTree(prev, node.path, (n) => ({ ...n, isExpanded: true })));
    }
  }, [root, shouldIgnore]);

  const handleItemClick = useCallback((node: TreeNode, e?: React.MouseEvent) => {
    if (e?.ctrlKey || e?.metaKey) {
      setSelectedPaths((prev) => { const next = new Set(prev); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next; });
      return;
    }
    setSelectedPaths(new Set());
    if (node.isDirectory) void toggleFolder(node);
    else onFileSelect(node.path);
  }, [toggleFolder, onFileSelect]);

  const handleDoubleClick = useCallback((node: TreeNode) => {
    setEditState({ targetPath: node.path, mode: 'rename', initialValue: node.name });
  }, []);
  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, node });
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu(INITIAL_CONTEXT_MENU), []);
  const handleRename = useCallback((node: TreeNode) => {
    setEditState({ targetPath: node.path, mode: 'rename', initialValue: node.name });
  }, []);

  const handleNewFile = useCallback((dir: string) => {
    const flat = flattenVisibleTree(rootNodes);
    const dirNode = flat.find((n) => n.path === dir);
    if (dirNode?.isDirectory && !dirNode.isExpanded) {
      void toggleFolder(dirNode).then(() => setEditState({ targetPath: dir, mode: 'newFile', initialValue: '' }));
    } else {
      setEditState({ targetPath: dir, mode: 'newFile', initialValue: '' });
    }
  }, [rootNodes, toggleFolder]);

  const handleNewFolder = useCallback((dir: string) => {
    const flat = flattenVisibleTree(rootNodes);
    const dirNode = flat.find((n) => n.path === dir);
    if (dirNode?.isDirectory && !dirNode.isExpanded) {
      void toggleFolder(dirNode).then(() => setEditState({ targetPath: dir, mode: 'newFolder', initialValue: '' }));
    } else {
      setEditState({ targetPath: dir, mode: 'newFolder', initialValue: '' });
    }
  }, [rootNodes, toggleFolder]);

  const handleDeleted = useCallback((node: TreeNode) => setRootNodes((prev) => removeNodeFromTree(prev, node.path)), []);
  const handleEditCancel = useCallback(() => setEditState(null), []);
  const clearEdit = useCallback(() => setEditState(null), []);

  const handleEditConfirm = useCallback(async (newName: string) => {
    if (!editState) return;
    const deps = { editState, toast, refreshDir, onFileSelect, clearEdit };
    if (editState.mode === 'rename') await handleRenameOp(deps, newName);
    else if (editState.mode === 'newFile') await handleNewFileOp(deps, newName);
    else if (editState.mode === 'newFolder') await handleNewFolderOp(deps, newName);
  }, [editState, toast, refreshDir, onFileSelect, clearEdit]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetNode: TreeNode) => {
    e.preventDefault();
    const destDir = targetNode.isDirectory ? targetNode.path : parentDir(targetNode.path);
    const externalFiles = Array.from(e.dataTransfer.files);
    if (externalFiles.length > 0) { await handleExternalDrop(externalFiles, destDir, toast, refreshDir); return; }
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (sourcePath) await handleInternalDrop(sourcePath, targetNode, toast, refreshDir);
  }, [toast, refreshDir]);

  const handleDeleteFocused = useCallback(async (node: TreeNode) => {
    if (!window.confirm(`Move "${node.name}" to trash?`)) return;
    const result = await window.electronAPI.files.delete(node.path);
    if (result.success) { toast(`Moved "${node.name}" to trash`, 'success'); setRootNodes((prev) => removeNodeFromTree(prev, node.path)); }
    else toast(`Failed to delete: ${result.error}`, 'error');
  }, [toast]);

  const handleBookmarkToggle = useCallback(async (node: TreeNode) => {
    const current = (await window.electronAPI.config.get('bookmarks') as string[]) ?? [];
    const already = current.includes(node.path);
    const updated = already ? current.filter((p) => p !== node.path) : [...current, node.path];
    const result = await window.electronAPI.config.set('bookmarks', updated);
    if (result.success) toast(already ? `Removed "${node.name}" from Pinned` : `Pinned "${node.name}"`, 'success');
    else toast(`Bookmark failed: ${result.error}`, 'error');
  }, [toast]);

  const handleStage = useCallback(async (node: TreeNode) => {
    const r = await window.electronAPI.git.stage(root, node.relativePath);
    toast(r.success ? `Staged "${node.name}"` : `Stage failed: ${r.error}`, r.success ? 'success' : 'error');
  }, [root, toast]);

  const handleUnstage = useCallback(async (node: TreeNode) => {
    const r = await window.electronAPI.git.unstage(root, node.relativePath);
    toast(r.success ? `Unstaged "${node.name}"` : `Unstage failed: ${r.error}`, r.success ? 'success' : 'error');
  }, [root, toast]);

  const flatRows = useMemo(() => flattenVisibleTree(rootNodes), [rootNodes]);
  const displayItems = useMemo(() => buildDisplayItems(flatRows, editState), [flatRows, editState]);

  useEffect(() => { setFocusIndex((p) => Math.min(p, Math.max(0, displayItems.length - 1))); }, [displayItems.length]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editState) return;
    handleTreeKeyDown(e, { displayItems, focusIndex, setFocusIndex, handleItemClick, toggleFolder, handleRename, handleDeleteFocused, handleNewFile, handleNewFolder, root });
  }, [displayItems, focusIndex, handleItemClick, toggleFolder, editState, handleRename, handleDeleteFocused, handleNewFile, handleNewFolder, root]);

  const handleRootDrop = useCallback((e: React.DragEvent) => {
    const ext = Array.from(e.dataTransfer.files);
    if (ext.length > 0) { void handleExternalDrop(ext, root, toast, refreshDir); return; }
    const src = e.dataTransfer.getData('text/plain');
    if (!src) return;
    const sep = src.includes('\\') ? '\\' : '/';
    const name = src.split(sep).pop()!;
    void window.electronAPI.files.rename(src, pathJoin(root, name)).then((r) => {
      if (r.success) { toast(`Moved "${name}" to root`, 'success'); void refreshDir(root); }
      else toast(`Move failed: ${r.error}`, 'error');
    });
  }, [root, toast, refreshDir]);

  const headerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleContextMenu(e, { name: basename(root), path: root, relativePath: '', isDirectory: true, depth: 0 });
  }, [root, handleContextMenu]);

  return (
    <div style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <RootSectionHeader root={root} isExpanded={isExpanded} onToggle={onToggle} onRemove={onRemove} onContextMenu={headerContextMenu} />
      {isExpanded && (
        <div onKeyDown={onKeyDown}>
          {isLoading && <FileTreeSkeleton />}
          {error && <div style={{ padding: '12px', color: 'var(--error)', fontSize: '0.8125rem' }}>{error}</div>}
          {!isLoading && !error && displayItems.length > 0 && (
            <VirtualTreeList root={root} displayItems={displayItems} activeFilePath={activeFilePath} focusIndex={focusIndex} selectedPaths={selectedPaths} bookmarks={bookmarks} editState={editState} gitStatus={gitStatus} getHeatLevel={getHeatLevel} handleItemClick={handleItemClick} handleDoubleClick={handleDoubleClick} handleContextMenu={handleContextMenu} handleEditConfirm={handleEditConfirm} handleEditCancel={handleEditCancel} handleDrop={handleDrop} handleRootDrop={handleRootDrop} />
          )}
          {!isLoading && !error && displayItems.length === 0 && (
            <div style={{ padding: '16px 12px', color: 'var(--text-faint)', fontSize: '0.8125rem', textAlign: 'center' }}>No files found in this directory.</div>
          )}
          <ContextMenu state={contextMenu} projectRoot={root} onClose={closeContextMenu} onRename={handleRename} onNewFile={handleNewFile} onNewFolder={handleNewFolder} onDeleted={handleDeleted} isBookmarked={contextMenu.node ? bookmarks.includes(contextMenu.node.path) : false} onBookmarkToggle={(n) => void handleBookmarkToggle(n)} gitStatus={contextMenu.node ? getNodeGitStatus(contextMenu.node, gitStatus) : undefined} onStage={(n) => void handleStage(n)} onUnstage={(n) => void handleUnstage(n)} />
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDisplayItems(flatRows: TreeNode[], editState: EditState | null): Array<{ node: TreeNode }> {
  const base = flatRows.map((n) => ({ node: n }));
  if (!editState || editState.mode === 'rename') return base;

  const items = [...base];
  const idx = items.findIndex((i) => i.node.path === editState.targetPath);
  if (idx === -1) return items;
  const parentNode = items[idx].node;
  const placeholder: TreeNode = { name: '', path: '__new_item_placeholder__', relativePath: '', isDirectory: editState.mode === 'newFolder', depth: parentNode.depth + 1, isExpanded: false, isLoading: false };
  items.splice(idx + 1, 0, { node: placeholder });
  return items;
}

function useFileWatcher(root: string, loadedDirsRef: React.MutableRefObject<Set<string>>, refreshDirRef: React.MutableRefObject<((d: string) => Promise<void>) | null>) {
  useEffect(() => {
    let active = true;
    let cleanupWatcher: (() => void) | null = null;
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    window.electronAPI.files.watchDir(root).then((result) => {
      if (!active || !result.success) return;
      cleanupWatcher = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
        if (!active) return;
        const dirToRefresh = findDirToRefresh(change.path, root, loadedDirsRef.current);
        if (!dirToRefresh) return;
        debounceRefresh(dirToRefresh, debounceTimers, root, active, refreshDirRef);
      });
    });

    return () => {
      active = false;
      cleanupWatcher?.();
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
      window.electronAPI.files.unwatchDir(root).catch(() => {});
    };
  }, [root, loadedDirsRef, refreshDirRef]);
}

function findDirToRefresh(changePath: string, root: string, loadedDirs: Set<string>): string | null {
  const changedNorm = normPath(changePath);
  const rootNorm = normPath(root);
  if (!changedNorm.startsWith(rootNorm)) return null;
  const changedParent = normPath(parentDir(changePath));
  if (loadedDirs.has(changedParent)) return changedParent;
  if (loadedDirs.has(rootNorm)) return rootNorm;
  return null;
}

function debounceRefresh(key: string, timers: Map<string, ReturnType<typeof setTimeout>>, root: string, active: boolean, refreshDirRef: React.MutableRefObject<((d: string) => Promise<void>) | null>) {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    if (!active || !refreshDirRef.current) return;
    const osPath = root.includes('\\') ? key.replace(/\//g, '\\') : key;
    void refreshDirRef.current(osPath);
  }, 300));
}
