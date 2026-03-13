import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';
import type { FileChangeEvent } from '../../types/electron';
import type { TreeNode } from './FileTreeItem';
import {
  buildIgnorePredicate,
  loadDirChildren,
  normPath,
  updateNodeInTree,
  flattenVisibleTree,
  parentDir,
} from './fileTreeUtils';

export type RefreshDir = (dirPath: string) => Promise<void>;
export type SetRootNodes = Dispatch<SetStateAction<TreeNode[]>>;

interface RootLoaderArgs {
  root: string;
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
  loadedDirsRef: MutableRefObject<Set<string>>;
  refreshDir: RefreshDir;
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

function useRootLoader({
  root,
  shouldIgnore,
  loadedDirsRef,
  setRootNodes,
  setIsLoading,
  setError,
}: RootLoaderArgs): void {
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadedDirsRef.current.clear();

    void loadRootChildren(root, shouldIgnore)
      .then((nodes) => {
        if (cancelled) return;
        setRootNodes(nodes);
        loadedDirsRef.current.add(normPath(root));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadedDirsRef, root, setError, setIsLoading, setRootNodes, shouldIgnore]);
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

function useRootFileWatcher({ root, loadedDirsRef, refreshDir }: WatcherArgs): void {
  const refreshDirRef = useRef(refreshDir);

  useEffect(() => {
    refreshDirRef.current = refreshDir;
  }, [refreshDir]);

  useEffect(() => {
    let active = true;
    let cleanupWatcher: (() => void) | null = null;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    void window.electronAPI.files.watchDir(root).then((result) => {
      if (!active || !result.success) return;
      cleanupWatcher = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
        const dirToRefresh = findDirToRefresh(change.path, root, loadedDirsRef.current);
        if (active && dirToRefresh) {
          scheduleRefresh({ key: dirToRefresh, timers, root, refreshDirRef });
        }
      });
    });

    return () => {
      active = false;
      cleanupWatcher?.();
      clearTimers(timers);
      void window.electronAPI.files.unwatchDir(root).catch(() => {});
    };
  }, [loadedDirsRef, root]);
}

export function useRootTreeState(root: string, extraIgnorePatterns: string[]) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedDirsRef = useRef<Set<string>>(new Set());
  const shouldIgnore = useMemo(() => buildIgnorePredicate(extraIgnorePatterns), [extraIgnorePatterns]);
  const refreshDir = useRefreshDir({ root, rootNodes, shouldIgnore, loadedDirsRef, setRootNodes });
  const toggleFolder = useToggleFolder({ root, shouldIgnore, loadedDirsRef, setRootNodes });

  useRootLoader({ root, shouldIgnore, loadedDirsRef, setRootNodes, setIsLoading, setError });
  useRootFileWatcher({ root, loadedDirsRef, refreshDir });

  return { rootNodes, setRootNodes, isLoading, error, refreshDir, toggleFolder };
}
