import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { subscribeToDirectoryChanges } from '../../hooks/directoryWatchRegistry';
import type { FileChangeEvent } from '../../types/electron';
import type { TreeNode } from './FileTreeItem';
import {
  buildIgnorePredicate,
  flattenVisibleTree,
  loadDirChildren,
  normPath,
  parentDir,
  updateNodeInTree,
} from './fileTreeUtils';

export type RefreshDir = (dirPath: string) => Promise<void>;
export type SetRootNodes = Dispatch<SetStateAction<TreeNode[]>>;

interface RootLoaderArgs {
  root: string;
  enabled: boolean;
  shouldIgnore: (name: string) => boolean;
  loadedDirsRef: MutableRefObject<Set<string>>;
  setRootNodes: SetRootNodes;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

interface RefreshDirArgs {
  root: string;
  rootNodes: TreeNode[];
  shouldIgnore: (name: string) => boolean;
  loadedDirsRef: MutableRefObject<Set<string>>;
  setRootNodes: SetRootNodes;
}

interface ToggleFolderArgs {
  root: string;
  shouldIgnore: (name: string) => boolean;
  loadedDirsRef: MutableRefObject<Set<string>>;
  setRootNodes: SetRootNodes;
}

interface WatcherArgs {
  root: string;
  enabled: boolean;
  loadedDirsRef: MutableRefObject<Set<string>>;
  refreshDir: RefreshDir;
}

interface UseRootTreeStateOptions {
  enabled?: boolean;
}

interface RefreshScheduleArgs {
  key: string;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  root: string;
  refreshDirRef: MutableRefObject<RefreshDir>;
}

function loadRootChildren(root: string, shouldIgnore: (name: string) => boolean): Promise<TreeNode[]> {
  return loadDirChildren(root, root, 0, shouldIgnore);
}

function setNodeExpanded(nodes: TreeNode[], targetPath: string, isExpanded: boolean): TreeNode[] {
  return updateNodeInTree(nodes, targetPath, (node) => ({ ...node, isExpanded }));
}

function setNodeLoading(nodes: TreeNode[], targetPath: string, isLoading: boolean): TreeNode[] {
  return updateNodeInTree(nodes, targetPath, (node) => ({ ...node, isExpanded: true, isLoading }));
}

function setLoadedChildren(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
  return updateNodeInTree(nodes, targetPath, (node) => ({
    ...node,
    children,
    isExpanded: true,
    isLoading: false,
  }));
}

function findNodeDepth(nodes: TreeNode[], dirPath: string): number {
  return flattenVisibleTree(nodes).find((node) => node.path === dirPath)?.depth ?? 0;
}

function findDirToRefresh(changePath: string, root: string, loadedDirs: Set<string>): string | null {
  const changedPath = normPath(changePath);
  const normalizedRoot = normPath(root);
  if (!changedPath.startsWith(normalizedRoot)) {
    return null;
  }

  const changedParent = normPath(parentDir(changePath));
  if (loadedDirs.has(changedParent)) {
    return changedParent;
  }
  return loadedDirs.has(normalizedRoot) ? normalizedRoot : null;
}

function scheduleRefresh({ key, timers, root, refreshDirRef }: RefreshScheduleArgs): void {
  const existing = timers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  timers.set(key, setTimeout(() => {
    timers.delete(key);
    const refreshPath = root.includes('\\') ? key.replace(/\//g, '\\') : key;
    void refreshDirRef.current(refreshPath);
  }, 300));
}

function clearTimers(timers: Map<string, ReturnType<typeof setTimeout>>): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
}

function loadRootWithCancellation({
  root,
  shouldIgnore,
  loadedDirsRef,
  setRootNodes,
  setIsLoading,
  setError,
}: RootLoaderArgs): () => void {
  let cancelled = false;
  setIsLoading(true);
  setError(null);

  void loadRootChildren(root, shouldIgnore)
    .then((nodes) => {
      if (cancelled) return;
      setRootNodes(nodes);
      loadedDirsRef.current.add(normPath(root));
    })
    .catch((error: unknown) => { if (!cancelled) setError(String(error)); })
    .finally(() => { if (!cancelled) setIsLoading(false); });

  return () => { cancelled = true; };
}

function useRootLoader({
  root,
  enabled,
  shouldIgnore,
  loadedDirsRef,
  setRootNodes,
  setIsLoading,
  setError,
}: RootLoaderArgs): void {
  useEffect(() => {
    if (!enabled) { setIsLoading(false); return; }
    if (loadedDirsRef.current.has(normPath(root))) return;
    return loadRootWithCancellation({ root, shouldIgnore, loadedDirsRef, setRootNodes, setIsLoading, setError });
  }, [enabled, loadedDirsRef, root, setError, setIsLoading, setRootNodes, shouldIgnore]);
}

function useRefreshDir({
  root,
  rootNodes,
  shouldIgnore,
  loadedDirsRef,
  setRootNodes,
}: RefreshDirArgs): RefreshDir {
  return useCallback(async (dirPath: string) => {
    if (normPath(dirPath) === normPath(root)) {
      const children = await loadRootChildren(root, shouldIgnore);
      loadedDirsRef.current.clear();
      loadedDirsRef.current.add(normPath(root));
      setRootNodes(children);
      return;
    }

    const depth = findNodeDepth(rootNodes, dirPath);
    const children = await loadDirChildren(root, dirPath, depth + 1, shouldIgnore);
    loadedDirsRef.current.add(normPath(dirPath));
    setRootNodes((prev) => setLoadedChildren(prev, dirPath, children));
  }, [loadedDirsRef, root, rootNodes, setRootNodes, shouldIgnore]);
}

function useToggleFolder({
  root,
  shouldIgnore,
  loadedDirsRef,
  setRootNodes,
}: ToggleFolderArgs): (node: TreeNode) => Promise<void> {
  return useCallback(async (node: TreeNode) => {
    if (!node.isDirectory) return;
    if (node.isExpanded) {
      setRootNodes((prev) => setNodeExpanded(prev, node.path, false));
      return;
    }
    if (node.children !== undefined) {
      setRootNodes((prev) => setNodeExpanded(prev, node.path, true));
      return;
    }

    setRootNodes((prev) => setNodeLoading(prev, node.path, true));
    try {
      const children = await loadDirChildren(root, node.path, node.depth + 1, shouldIgnore);
      loadedDirsRef.current.add(normPath(node.path));
      setRootNodes((prev) => setLoadedChildren(prev, node.path, children));
    } catch {
      setRootNodes((prev) => setLoadedChildren(prev, node.path, []));
    }
  }, [loadedDirsRef, root, setRootNodes, shouldIgnore]);
}

function useRootFileWatcher({ root, enabled, loadedDirsRef, refreshDir }: WatcherArgs): void {
  const refreshDirRef = useRef(refreshDir);

  useEffect(() => {
    refreshDirRef.current = refreshDir;
  }, [refreshDir]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    let cleanupWatcher: (() => void) | null = null;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    if (active) {
      cleanupWatcher = subscribeToDirectoryChanges(root, (change: FileChangeEvent) => {
        const dirToRefresh = findDirToRefresh(change.path, root, loadedDirsRef.current);
        if (active && dirToRefresh) {
          scheduleRefresh({ key: dirToRefresh, timers, root, refreshDirRef });
        }
      });
    }

    return () => {
      active = false;
      cleanupWatcher?.();
      clearTimers(timers);
    };
  }, [enabled, loadedDirsRef, root]);
}

export function useRootTreeState(root: string, extraIgnorePatterns: string[], { enabled = true }: UseRootTreeStateOptions = {}) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedDirsRef = useRef<Set<string>>(new Set());
  const shouldIgnore = useMemo(() => buildIgnorePredicate(extraIgnorePatterns), [extraIgnorePatterns]);
  const refreshDir = useRefreshDir({ root, rootNodes, shouldIgnore, loadedDirsRef, setRootNodes });
  const toggleFolder = useToggleFolder({ root, shouldIgnore, loadedDirsRef, setRootNodes });

  useRootLoader({ root, enabled, shouldIgnore, loadedDirsRef, setRootNodes, setIsLoading, setError });
  useRootFileWatcher({ root, enabled, loadedDirsRef, refreshDir });

  return { rootNodes, setRootNodes, isLoading, error, refreshDir, toggleFolder };
}
