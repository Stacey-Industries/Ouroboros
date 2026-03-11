import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import Fuse from 'fuse.js';
import type { TreeNode, MatchRange } from './FileTreeItem';
import { FileTreeItem } from './FileTreeItem';
import { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';
import { ContextMenu, INITIAL_CONTEXT_MENU } from './ContextMenu';
import type { ContextMenuState } from './ContextMenu';
import { FileTreeSkeleton, EmptyState } from '../shared';
import { useGitStatus } from '../../hooks/useGitStatus';
import { useToastContext } from '../../contexts/ToastContext';
import type { GitFileStatus, FileChangeEvent } from '../../types/electron';

// ─── Public props ─────────────────────────────────────────────────────────────

export interface FileTreeProps {
  /** All open project roots */
  projectRoots: string[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  /** Called when the user removes a root from the workspace */
  onRemoveRoot?: (root: string) => void;
  // Backwards-compatible single-root prop (ignored when projectRoots is non-empty)
  projectRoot?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_HEIGHT = 28;
const OVERSCAN = 5;

/** Hardcoded directories to always skip */
const IGNORED_DIRS_BASE = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '__pycache__',
]);

// ─── Utility functions (shared across roots) ──────────────────────────────────

function buildIgnorePredicate(extraPatterns: string[]): (name: string) => boolean {
  return (name: string): boolean => {
    if (name.startsWith('.') || IGNORED_DIRS_BASE.has(name)) return true;
    for (const pattern of extraPatterns) {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        if (name.endsWith(suffix)) return true;
      } else {
        if (name === pattern) return true;
      }
    }
    return false;
  };
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function relPath(root: string, absPath: string): string {
  const rn = normPath(root);
  const an = normPath(absPath);
  return an.startsWith(rn) ? an.slice(rn.length).replace(/^\//, '') : an;
}

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

async function loadDirChildren(
  root: string,
  dirPath: string,
  depth: number,
  shouldIgnore: (name: string) => boolean = (n) => n.startsWith('.') || IGNORED_DIRS_BASE.has(n)
): Promise<TreeNode[]> {
  const result = await window.electronAPI.files.readDir(dirPath);
  if (!result.success || !result.items) return [];

  const nodes: TreeNode[] = [];
  for (const item of result.items) {
    if (shouldIgnore(item.name)) continue;

    const rel = relPath(root, item.path);
    nodes.push({
      name: item.name,
      path: item.path,
      relativePath: rel,
      isDirectory: item.isDirectory,
      depth,
      children: item.isDirectory ? undefined : undefined,
      isExpanded: false,
      isLoading: false,
    });
  }

  return sortNodes(nodes);
}

function updateNodeInTree(
  nodes: TreeNode[],
  targetPath: string,
  updater: (node: TreeNode) => TreeNode
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return updater(node);
    }
    if (node.children && node.isDirectory) {
      const updatedChildren = updateNodeInTree(node.children, targetPath, updater);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
    }
    return node;
  });
}

function removeNodeFromTree(nodes: TreeNode[], targetPath: string): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.path === targetPath) continue;
    if (node.children && node.isDirectory) {
      const updatedChildren = removeNodeFromTree(node.children, targetPath);
      result.push({ ...node, children: updatedChildren });
    } else {
      result.push(node);
    }
  }
  return result;
}

function flattenVisibleTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.isDirectory && node.isExpanded && node.children) {
      result.push(...flattenVisibleTree(node.children));
    }
  }
  return result;
}

function collectAllFiles(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (!node.isDirectory) {
      result.push(node);
    }
    if (node.isDirectory && node.children) {
      result.push(...collectAllFiles(node.children));
    }
  }
  return result;
}

const STATUS_PRIORITY: Record<string, number> = {
  'D': 4,
  'M': 3,
  'A': 2,
  'R': 2,
  '?': 1,
};

function getNodeGitStatus(
  node: TreeNode,
  gitStatusMap: Map<string, GitFileStatus>
): GitFileStatus | undefined {
  if (!node.isDirectory) {
    return gitStatusMap.get(node.relativePath);
  }

  const prefix = node.relativePath + '/';
  let worst: GitFileStatus | undefined;
  let worstPriority = 0;

  for (const [filePath, status] of gitStatusMap) {
    if (filePath.startsWith(prefix)) {
      const p = STATUS_PRIORITY[status] ?? 0;
      if (p > worstPriority) {
        worstPriority = p;
        worst = status as GitFileStatus;
      }
    }
  }

  return worst;
}

function pathJoin(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return base.endsWith(sep) ? base + name : base + sep + name;
}

function parentDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return filePath;
  const parent = normalized.slice(0, lastSlash);
  if (filePath.includes('\\')) {
    return parent.replace(/\//g, '\\');
  }
  return parent;
}

// ─── Inline edit state types ──────────────────────────────────────────────────

interface EditState {
  targetPath: string;
  mode: 'rename' | 'newFile' | 'newFolder';
  initialValue: string;
}

// ─── FolderIcon helper ────────────────────────────────────────────────────────

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5L6.5 4H10.5C11.052 4 11.5 4.448 11.5 5V9.5C11.5 10.052 11.052 10.5 10.5 10.5H2.5C1.948 10.5 1.5 10.052 1.5 9.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── RootSection ──────────────────────────────────────────────────────────────

interface RootSectionProps {
  root: string;
  isExpanded: boolean;
  onToggle: () => void;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onRemove?: () => void;
  bookmarks: string[];
  extraIgnorePatterns: string[];
}

function RootSection({
  root,
  isExpanded,
  onToggle,
  activeFilePath,
  onFileSelect,
  onRemove,
  bookmarks,
  extraIgnorePatterns,
}: RootSectionProps): React.ReactElement {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(INITIAL_CONTEXT_MENU);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const listRef = useRef<HTMLDivElement>(null);
  const containerHeight = useRef(400);
  const loadedDirsRef = useRef<Set<string>>(new Set());

  const { toast } = useToastContext();
  const { gitStatus } = useGitStatus(root);

  const shouldIgnore = useMemo(
    () => buildIgnorePredicate(extraIgnorePatterns),
    [extraIgnorePatterns]
  );

  // Load root on mount or when root/ignorePatterns change
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadedDirsRef.current.clear();

    loadDirChildren(root, root, 0, shouldIgnore)
      .then((nodes) => {
        if (!cancelled) {
          setRootNodes(nodes);
          loadedDirsRef.current.add(normPath(root));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [root, shouldIgnore]);

  // ── File watcher: auto-refresh tree on external changes ──────────────────
  const refreshDirRef = useRef<((dirPath: string) => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    let cleanupWatcher: (() => void) | null = null;
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    window.electronAPI.files.watchDir(root).then((result) => {
      if (!active || !result.success) return;

      cleanupWatcher = window.electronAPI.files.onFileChange((change: FileChangeEvent) => {
        if (!active) return;
        const changedNorm = normPath(change.path);
        const rootNorm = normPath(root);
        if (!changedNorm.startsWith(rootNorm)) return;

        // Determine which loaded parent directory to refresh
        const changedParent = normPath(parentDir(change.path));
        // Find the nearest ancestor that we've already loaded
        let dirToRefresh: string | null = null;
        if (loadedDirsRef.current.has(changedParent)) {
          dirToRefresh = changedParent;
        } else if (loadedDirsRef.current.has(rootNorm)) {
          // For changes at the root level
          dirToRefresh = rootNorm;
        }

        if (!dirToRefresh) return;

        // Debounce per-directory (300ms to batch rapid changes)
        const key = dirToRefresh;
        const existing = debounceTimers.get(key);
        if (existing) clearTimeout(existing);
        debounceTimers.set(
          key,
          setTimeout(() => {
            debounceTimers.delete(key);
            if (active && refreshDirRef.current) {
              // Convert normalized path back to OS-style path for refreshDir
              const osPath = root.includes('\\') ? key.replace(/\//g, '\\') : key;
              void refreshDirRef.current(osPath);
            }
          }, 300)
        );
      });
    });

    return () => {
      active = false;
      cleanupWatcher?.();
      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();
      window.electronAPI.files.unwatchDir(root).catch(() => {});
    };
  }, [root]);

  const refreshDir = useCallback(
    async (dirPath: string) => {
      const flatRows = flattenVisibleTree(rootNodes);
      const dirNode = flatRows.find((n) => n.path === dirPath);
      const depth = dirNode ? dirNode.depth : 0;

      if (normPath(dirPath) === normPath(root)) {
        loadedDirsRef.current.clear();
        const children = await loadDirChildren(root, root, 0, shouldIgnore);
        loadedDirsRef.current.add(normPath(root));
        setRootNodes(children);
        return;
      }

      const children = await loadDirChildren(root, dirPath, depth + 1, shouldIgnore);
      loadedDirsRef.current.add(normPath(dirPath));
      setRootNodes((prev) =>
        updateNodeInTree(prev, dirPath, (n) => ({
          ...n,
          children,
          isExpanded: true,
          isLoading: false,
        }))
      );
    },
    [root, rootNodes, shouldIgnore]
  );

  // Keep the ref in sync so the watcher effect can call refreshDir
  useEffect(() => {
    refreshDirRef.current = refreshDir;
  }, [refreshDir]);

  const toggleFolder = useCallback(
    async (node: TreeNode) => {
      if (!node.isDirectory) return;

      if (node.isExpanded) {
        setRootNodes((prev) =>
          updateNodeInTree(prev, node.path, (n) => ({
            ...n,
            isExpanded: false,
          }))
        );
        return;
      }

      const normalised = normPath(node.path);

      if (node.children === undefined) {
        setRootNodes((prev) =>
          updateNodeInTree(prev, node.path, (n) => ({
            ...n,
            isExpanded: true,
            isLoading: true,
          }))
        );

        try {
          const children = await loadDirChildren(root, node.path, node.depth + 1, shouldIgnore);
          loadedDirsRef.current.add(normalised);
          setRootNodes((prev) =>
            updateNodeInTree(prev, node.path, (n) => ({
              ...n,
              children,
              isExpanded: true,
              isLoading: false,
            }))
          );
        } catch {
          setRootNodes((prev) =>
            updateNodeInTree(prev, node.path, (n) => ({
              ...n,
              children: [],
              isExpanded: true,
              isLoading: false,
            }))
          );
        }
      } else {
        setRootNodes((prev) =>
          updateNodeInTree(prev, node.path, (n) => ({
            ...n,
            isExpanded: true,
          }))
        );
      }
    },
    [root, shouldIgnore]
  );

  const handleItemClick = useCallback(
    (node: TreeNode, e?: React.MouseEvent) => {
      if (e?.ctrlKey || e?.metaKey) {
        // Ctrl/Cmd+click: toggle this path in the multi-selection
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(node.path)) next.delete(node.path);
          else next.add(node.path);
          return next;
        });
        return;
      }
      // Regular click: clear selection and open/toggle as normal
      setSelectedPaths(new Set());
      if (node.isDirectory) {
        void toggleFolder(node);
      } else {
        onFileSelect(node.path);
      }
    },
    [toggleFolder, onFileSelect]
  );

  const handleDoubleClick = useCallback((node: TreeNode) => {
    setEditState({ targetPath: node.path, mode: 'rename', initialValue: node.name });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(INITIAL_CONTEXT_MENU);
  }, []);

  const handleRename = useCallback((node: TreeNode) => {
    setEditState({ targetPath: node.path, mode: 'rename', initialValue: node.name });
  }, []);

  const handleNewFile = useCallback(
    (parentDirPath: string) => {
      const flatRows = flattenVisibleTree(rootNodes);
      const dirNode = flatRows.find((n) => n.path === parentDirPath);
      if (dirNode && dirNode.isDirectory && !dirNode.isExpanded) {
        void toggleFolder(dirNode).then(() => {
          setEditState({ targetPath: parentDirPath, mode: 'newFile', initialValue: '' });
        });
      } else {
        setEditState({ targetPath: parentDirPath, mode: 'newFile', initialValue: '' });
      }
    },
    [rootNodes, toggleFolder]
  );

  const handleNewFolder = useCallback(
    (parentDirPath: string) => {
      const flatRows = flattenVisibleTree(rootNodes);
      const dirNode = flatRows.find((n) => n.path === parentDirPath);
      if (dirNode && dirNode.isDirectory && !dirNode.isExpanded) {
        void toggleFolder(dirNode).then(() => {
          setEditState({ targetPath: parentDirPath, mode: 'newFolder', initialValue: '' });
        });
      } else {
        setEditState({ targetPath: parentDirPath, mode: 'newFolder', initialValue: '' });
      }
    },
    [rootNodes, toggleFolder]
  );

  const handleDeleted = useCallback((node: TreeNode) => {
    setRootNodes((prev) => removeNodeFromTree(prev, node.path));
  }, []);

  const handleBookmarkToggle = useCallback(
    async (node: TreeNode) => {
      const current = await window.electronAPI.config.get('bookmarks') as string[];
      const existing = current ?? [];
      const isAlreadyBookmarked = existing.includes(node.path);
      const updated = isAlreadyBookmarked
        ? existing.filter((p) => p !== node.path)
        : [...existing, node.path];

      const result = await window.electronAPI.config.set('bookmarks', updated);
      if (result.success) {
        toast(
          isAlreadyBookmarked ? `Removed "${node.name}" from Pinned` : `Pinned "${node.name}"`,
          'success'
        );
      } else {
        toast(`Bookmark failed: ${result.error}`, 'error');
      }
    },
    [toast]
  );

  const handleStage = useCallback(
    async (node: TreeNode) => {
      const result = await window.electronAPI.git.stage(root, node.relativePath);
      if (result.success) {
        toast(`Staged "${node.name}"`, 'success');
      } else {
        toast(`Stage failed: ${result.error}`, 'error');
      }
    },
    [root, toast]
  );

  const handleUnstage = useCallback(
    async (node: TreeNode) => {
      const result = await window.electronAPI.git.unstage(root, node.relativePath);
      if (result.success) {
        toast(`Unstaged "${node.name}"`, 'success');
      } else {
        toast(`Unstage failed: ${result.error}`, 'error');
      }
    },
    [root, toast]
  );

  const handleEditConfirm = useCallback(
    async (newName: string) => {
      if (!editState) return;

      const { targetPath, mode } = editState;

      if (mode === 'rename') {
        const dir = parentDir(targetPath);
        const newPath = pathJoin(dir, newName);
        const result = await window.electronAPI.files.rename(targetPath, newPath);
        if (result.success) {
          toast(`Renamed to "${newName}"`, 'success');
          await refreshDir(dir);
        } else {
          toast(`Rename failed: ${result.error}`, 'error');
        }
      } else if (mode === 'newFile') {
        const newPath = pathJoin(targetPath, newName);
        const result = await window.electronAPI.files.createFile(newPath);
        if (result.success) {
          toast(`Created "${newName}"`, 'success');
          await refreshDir(targetPath);
          onFileSelect(newPath);
        } else {
          toast(`Create failed: ${result.error}`, 'error');
        }
      } else if (mode === 'newFolder') {
        const newPath = pathJoin(targetPath, newName);
        const result = await window.electronAPI.files.mkdir(newPath);
        if (result.success) {
          toast(`Created folder "${newName}"`, 'success');
          await refreshDir(targetPath);
        } else {
          toast(`Create failed: ${result.error}`, 'error');
        }
      }

      setEditState(null);
    },
    [editState, toast, refreshDir, onFileSelect]
  );

  const handleEditCancel = useCallback(() => {
    setEditState(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetNode: TreeNode) => {
      e.preventDefault();
      const destDir = targetNode.isDirectory ? targetNode.path : parentDir(targetNode.path);

      // External OS file drop — read content via FileReader, write via IPC
      const externalFiles = Array.from(e.dataTransfer.files);
      if (externalFiles.length > 0) {
        for (const file of externalFiles) {
          const destPath = pathJoin(destDir, file.name);
          try {
            const buf = new Uint8Array(await file.arrayBuffer());
            const result = await window.electronAPI.files.writeFile(destPath, buf);
            if (result.success) {
              toast(`Copied "${file.name}"`, 'success');
            } else {
              toast(`Copy failed: ${result.error}`, 'error');
            }
          } catch (err) {
            toast(`Copy failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
          }
        }
        await refreshDir(destDir);
        return;
      }

      // Internal tree drag (path stored in text/plain)
      const sourcePath = e.dataTransfer.getData('text/plain');
      if (!sourcePath || sourcePath === targetNode.path) return;

      const sep = sourcePath.includes('\\') ? '\\' : '/';
      const sourceName = sourcePath.split(sep).pop()!;
      const destPath = pathJoin(destDir, sourceName);

      if (destPath === sourcePath) return;
      const normalizedSource = normPath(sourcePath);
      const normalizedDest = normPath(destPath);
      if (normalizedDest.startsWith(normalizedSource + '/')) {
        toast('Cannot move a folder into itself', 'error');
        return;
      }

      const result = await window.electronAPI.files.rename(sourcePath, destPath);
      if (result.success) {
        toast(`Moved "${sourceName}"`, 'success');
        await refreshDir(parentDir(sourcePath));
        if (targetNode.isDirectory) await refreshDir(targetNode.path);
      } else {
        toast(`Move failed: ${result.error}`, 'error');
      }
    },
    [toast, refreshDir]
  );

  const handleDeleteFocused = useCallback(
    async (node: TreeNode) => {
      const confirmed = window.confirm(`Move "${node.name}" to trash?`);
      if (!confirmed) return;

      const result = await window.electronAPI.files.delete(node.path);
      if (result.success) {
        toast(`Moved "${node.name}" to trash`, 'success');
        setRootNodes((prev) => removeNodeFromTree(prev, node.path));
      } else {
        toast(`Failed to delete: ${result.error}`, 'error');
      }
    },
    [toast]
  );

  // Flatten visible tree for virtualisation
  const flatRows = useMemo(() => flattenVisibleTree(rootNodes), [rootNodes]);

  // Build display items
  const baseDisplayItems = flatRows.map((n) => ({ node: n }));

  const displayItems = useMemo(() => {
    if (!editState || editState.mode === 'rename') {
      return baseDisplayItems;
    }

    const parentPath = editState.targetPath;
    const items = [...baseDisplayItems];
    const parentIndex = items.findIndex((item) => item.node.path === parentPath);
    if (parentIndex === -1) return items;

    const parentNode = items[parentIndex].node;
    const placeholderDepth = parentNode.depth + 1;
    const isFolder = editState.mode === 'newFolder';

    const placeholder: TreeNode = {
      name: '',
      path: '__new_item_placeholder__',
      relativePath: '',
      isDirectory: isFolder,
      depth: placeholderDepth,
      isExpanded: false,
      isLoading: false,
    };

    items.splice(parentIndex + 1, 0, { node: placeholder });
    return items;
  }, [baseDisplayItems, editState]);

  useEffect(() => {
    setFocusIndex((prev) => Math.min(prev, Math.max(0, displayItems.length - 1)));
  }, [displayItems.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editState) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = displayItems[focusIndex];
        if (item) handleItemClick(item.node);
      } else if (e.key === 'Escape') {
        setFocusIndex(0);
      } else if (e.key === 'ArrowRight') {
        const item = displayItems[focusIndex];
        if (item?.node.isDirectory && !item.node.isExpanded) {
          e.preventDefault();
          void toggleFolder(item.node);
        }
      } else if (e.key === 'ArrowLeft') {
        const item = displayItems[focusIndex];
        if (item?.node.isDirectory && item.node.isExpanded) {
          e.preventDefault();
          void toggleFolder(item.node);
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        const item = displayItems[focusIndex];
        if (item?.node) handleRename(item.node);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        const item = displayItems[focusIndex];
        if (item?.node) void handleDeleteFocused(item.node);
      } else if (e.key === 'n' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        const item = displayItems[focusIndex];
        const dir = item?.node.isDirectory
          ? item.node.path
          : item?.node
          ? parentDir(item.node.path)
          : root;
        handleNewFile(dir);
      } else if (e.key === 'N' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        const item = displayItems[focusIndex];
        const dir = item?.node.isDirectory
          ? item.node.path
          : item?.node
          ? parentDir(item.node.path)
          : root;
        handleNewFolder(dir);
      }
    },
    [
      displayItems,
      focusIndex,
      handleItemClick,
      toggleFolder,
      editState,
      handleRename,
      handleDeleteFocused,
      handleNewFile,
      handleNewFolder,
      root,
    ]
  );

  useEffect(() => {
    const itemTop = focusIndex * ITEM_HEIGHT;
    const itemBottom = itemTop + ITEM_HEIGHT;
    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + containerHeight.current;

    if (itemTop < visibleTop) {
      listRef.current?.scrollTo({ top: itemTop });
    } else if (itemBottom > visibleBottom) {
      listRef.current?.scrollTo({ top: itemBottom - containerHeight.current });
    }
  }, [focusIndex, scrollTop]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    containerHeight.current = e.currentTarget.clientHeight;
  }, []);

  const totalHeight = displayItems.length * ITEM_HEIGHT;
  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight.current / ITEM_HEIGHT) + OVERSCAN * 2;
  const visibleEnd = Math.min(displayItems.length, visibleStart + visibleCount);
  const visibleSlice = displayItems.slice(visibleStart, visibleEnd);

  return (
    <div style={{ borderBottom: '1px solid var(--border-muted)' }}>
      {/* Root header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          gap: '4px',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-muted)',
          minHeight: '26px',
        }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
        aria-expanded={isExpanded}
        aria-label={`Toggle ${basename(root)}`}
      >
        {/* Collapse chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: 'var(--text-faint)',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
          }}
        >
          <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <FolderIcon />
        </span>

        <span
          style={{
            flex: 1,
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={root}
        >
          {basename(root)}
        </span>

        {/* Remove button — only when handler is provided */}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title={`Remove "${basename(root)}" from workspace`}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: 'var(--text-faint)',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--error)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)')}
            aria-label={`Remove ${basename(root)} from workspace`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Expanded tree content */}
      {isExpanded && (
        <div onKeyDown={handleKeyDown}>
          {isLoading && <FileTreeSkeleton />}

          {error && (
            <div style={{ padding: '12px', color: 'var(--error)', fontSize: '0.8125rem' }}>
              {error}
            </div>
          )}

          {!isLoading && !error && displayItems.length > 0 && (
            <div
              ref={listRef}
              role="listbox"
              aria-label={`Files in ${basename(root)}`}
              onScroll={handleScroll}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'; }}
              onDrop={(e) => {
                // External OS file drop — read via FileReader, write via IPC
                const externalFiles = Array.from(e.dataTransfer.files);
                if (externalFiles.length > 0) {
                  void (async () => {
                    for (const file of externalFiles) {
                      try {
                        const buf = new Uint8Array(await file.arrayBuffer());
                        const destPath = pathJoin(root, file.name);
                        const r = await window.electronAPI.files.writeFile(destPath, buf);
                        if (r.success) toast(`Copied "${file.name}"`, 'success');
                        else toast(`Copy failed: ${r.error}`, 'error');
                      } catch (err) {
                        toast(`Copy failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
                      }
                    }
                    void refreshDir(root);
                  })();
                  return;
                }
                // Internal tree drag
                const sourcePath = e.dataTransfer.getData('text/plain');
                if (sourcePath) {
                  const sep = sourcePath.includes('\\') ? '\\' : '/';
                  const sourceName = sourcePath.split(sep).pop()!;
                  void window.electronAPI.files.rename(sourcePath, pathJoin(root, sourceName)).then(r => {
                    if (r.success) { toast(`Moved "${sourceName}" to root`, 'success'); void refreshDir(root); }
                    else toast(`Move failed: ${r.error}`, 'error');
                  });
                }
              }}
              style={{
                overflowY: 'auto',
                overflowX: 'hidden',
                position: 'relative',
                maxHeight: '60vh',
              }}
            >
              <div style={{ height: totalHeight, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: visibleStart * ITEM_HEIGHT,
                    left: 0,
                    right: 0,
                  }}
                >
                  {visibleSlice.map((item, i) => {
                    const absoluteIndex = visibleStart + i;
                    const { node } = item;
                    const nodeGitStatus = getNodeGitStatus(node, gitStatus);
                    const isPlaceholder = node.path === '__new_item_placeholder__';
                    const isRenaming = editState?.mode === 'rename' && editState.targetPath === node.path;
                    const isEditing = isPlaceholder || isRenaming;

                    return (
                      <FileTreeItem
                        key={isPlaceholder ? '__new_item_placeholder__' : node.path}
                        node={node}
                        depth={node.depth}
                        isActive={node.path === activeFilePath}
                        isFocused={absoluteIndex === focusIndex}
                        isSelected={selectedPaths.has(node.path)}
                        searchMode={false}
                        gitStatus={nodeGitStatus}
                        isBookmarked={bookmarks.includes(node.path)}
                        isEditing={isEditing}
                        editValue={isEditing ? editState?.initialValue : undefined}
                        onEditConfirm={isEditing ? (newName: string) => void handleEditConfirm(newName) : undefined}
                        onEditCancel={isEditing ? handleEditCancel : undefined}
                        onClick={handleItemClick}
                        onDoubleClick={handleDoubleClick}
                        onContextMenu={handleContextMenu}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'; }}
                        onDrop={isPlaceholder ? undefined : handleDrop}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!isLoading && !error && displayItems.length === 0 && (
            <div style={{ padding: '16px 12px', color: 'var(--text-faint)', fontSize: '0.8125rem', textAlign: 'center' }}>
              No files found in this directory.
            </div>
          )}

          {/* Context menu */}
          <ContextMenu
            state={contextMenu}
            projectRoot={root}
            onClose={closeContextMenu}
            onRename={handleRename}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onDeleted={handleDeleted}
            isBookmarked={contextMenu.node ? bookmarks.includes(contextMenu.node.path) : false}
            onBookmarkToggle={(node) => void handleBookmarkToggle(node)}
            gitStatus={contextMenu.node ? getNodeGitStatus(contextMenu.node, gitStatus) : undefined}
            onStage={(node) => void handleStage(node)}
            onUnstage={(node) => void handleUnstage(node)}
          />
        </div>
      )}
    </div>
  );
}

// ─── PinnedSection ────────────────────────────────────────────────────────────

interface PinnedItemInfo {
  path: string;
  name: string;
  isDirectory: boolean;
}

interface PinnedSectionProps {
  bookmarks: string[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onUnpin: (path: string) => void;
}

function PinnedSection({
  bookmarks,
  activeFilePath,
  onFileSelect,
  onUnpin,
}: PinnedSectionProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(true);
  const [pinnedItems, setPinnedItems] = useState<PinnedItemInfo[]>([]);

  // Resolve bookmark paths to get name and isDirectory info
  useEffect(() => {
    if (bookmarks.length === 0) {
      setPinnedItems([]);
      return;
    }

    let cancelled = false;

    async function resolve() {
      const items: PinnedItemInfo[] = [];
      for (const bPath of bookmarks) {
        const name = bPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? bPath;
        // Try to determine if it's a directory by reading its parent
        // We'll use a simple stat-like approach: try readDir on it
        const result = await window.electronAPI.files.readDir(bPath);
        const isDir = result.success === true;
        items.push({ path: bPath, name, isDirectory: isDir });
      }
      if (!cancelled) setPinnedItems(items);
    }

    void resolve();
    return () => { cancelled = true; };
  }, [bookmarks]);

  if (bookmarks.length === 0) return null;

  return (
    <div style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <style>{`.pinned-item-row:hover .pinned-unpin-btn { opacity: 1 !important; }`}</style>
      {/* Pinned header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          gap: '4px',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-muted)',
          minHeight: '26px',
        }}
        onClick={() => setIsExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsExpanded((prev) => !prev); }}
        aria-expanded={isExpanded}
        aria-label="Toggle Pinned section"
      >
        {/* Collapse chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: 'var(--text-faint)',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
          }}
        >
          <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Pin icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ flexShrink: 0, color: 'var(--accent)' }}
        >
          <path
            d="M9.828 2.172a2 2 0 0 1 2.828 0l1.172 1.172a2 2 0 0 1 0 2.828L11 9l.5 5-3-3-4 4v-1.5L1 11l3-3-3-3 5 .5z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span
          style={{
            flex: 1,
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Pinned
        </span>

        {/* Count badge */}
        <span
          style={{
            flexShrink: 0,
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--text-faint)',
            backgroundColor: 'var(--bg)',
            padding: '0 5px',
            borderRadius: '8px',
            lineHeight: '16px',
          }}
        >
          {bookmarks.length}
        </span>
      </div>

      {/* Pinned items list */}
      {isExpanded && (
        <div role="list" aria-label="Pinned items">
          {pinnedItems.map((item) => (
            <div
              key={item.path}
              role="listitem"
              className="pinned-item-row"
              onClick={() => onFileSelect(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                paddingLeft: '20px',
                paddingRight: '8px',
                cursor: 'pointer',
                height: '28px',
                boxSizing: 'border-box',
                backgroundColor: item.path === activeFilePath
                  ? 'rgba(var(--accent-rgb, 88, 166, 255), 0.1)'
                  : 'transparent',
                borderLeft: item.path === activeFilePath
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                if (item.path !== activeFilePath) {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                if (item.path !== activeFilePath) {
                  (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                }
              }}
              title={item.path}
            >
              {/* File/folder icon */}
              {item.isDirectory ? (
                <FolderTypeIcon name={item.name} open={false} />
              ) : (
                <FileTypeIcon filename={item.name} />
              )}

              {/* Name */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8125rem',
                  color: item.isDirectory ? 'var(--text)' : 'var(--text-secondary)',
                  fontFamily: item.isDirectory ? 'var(--font-ui)' : 'var(--font-mono)',
                  fontWeight: item.isDirectory ? 500 : undefined,
                }}
              >
                {item.name}
              </span>

              {/* Accent dot */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '0.625rem',
                  color: 'var(--accent)',
                  lineHeight: 1,
                }}
              >
                ●
              </span>

              {/* Unpin button */}
              <button
                className="pinned-unpin-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpin(item.path);
                }}
                title={`Unpin "${item.name}"`}
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  color: 'var(--text-faint)',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '3px',
                  opacity: 0,
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
                }}
                aria-label={`Unpin ${item.name}`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FileTree ─────────────────────────────────────────────────────────────────

/**
 * FileTree — multi-root hierarchical tree view.
 *
 * Each root is rendered as a collapsible RootSection with its own independent
 * tree state, git status polling, search, and file operations.
 *
 * When only one root is open, the header is still shown for consistency but the
 * remove button is hidden (you can't remove the last root this way — use the
 * project picker instead).
 */
export function FileTree({
  projectRoots,
  activeFilePath,
  onFileSelect,
  onRemoveRoot,
  projectRoot: singleRootProp,
}: FileTreeProps): React.ReactElement {
  // Normalise: if projectRoots is empty but the legacy single-root prop is set,
  // use it. This keeps backwards compatibility when callers haven't been updated.
  const roots = useMemo(() => {
    if (projectRoots.length > 0) return projectRoots;
    if (singleRootProp) return [singleRootProp];
    return [];
  }, [projectRoots, singleRootProp]);

  // Track which roots are expanded (all expanded by default)
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set(roots));

  // When a new root is added, auto-expand it
  useEffect(() => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      for (const r of roots) {
        if (!next.has(r)) next.add(r);
      }
      return next;
    });
  }, [roots]);

  const toggleRoot = useCallback((root: string) => {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(root)) {
        next.delete(root);
      } else {
        next.add(root);
      }
      return next;
    });
  }, []);

  // Shared config state (bookmarks + ignore patterns) loaded once here
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [extraIgnorePatterns, setExtraIgnorePatterns] = useState<string[]>([]);

  useEffect(() => {
    void window.electronAPI.config.get('bookmarks').then((val) => {
      setBookmarks((val as string[]) ?? []);
    });
    void window.electronAPI.config.get('fileTreeIgnorePatterns').then((val) => {
      setExtraIgnorePatterns((val as string[]) ?? []);
    });

    const cleanup = window.electronAPI.config.onExternalChange((cfg) => {
      setBookmarks(cfg.bookmarks ?? []);
      setExtraIgnorePatterns(cfg.fileTreeIgnorePatterns ?? []);
    });
    return cleanup;
  }, []);

  const { toast } = useToastContext();

  // Handler to unpin a bookmark from the Pinned section
  const handleUnpin = useCallback(
    async (path: string) => {
      const updated = bookmarks.filter((p) => p !== path);
      const result = await window.electronAPI.config.set('bookmarks', updated);
      if (result.success) {
        setBookmarks(updated);
        const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
        toast(`Removed "${name}" from Pinned`, 'success');
      } else {
        toast(`Unpin failed: ${result.error}`, 'error');
      }
    },
    [bookmarks, toast]
  );

  // Shared cross-root search state
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (roots.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <EmptyState
          icon="folder"
          title="Open a folder to get started"
          description="Use the project picker above or open a folder from the File menu."
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Global search input */}
      <div
        style={{
          padding: '6px 8px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border-muted)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files…"
          aria-label="Filter files"
          className="selectable"
          style={{
            width: '100%',
            padding: '4px 8px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-ui)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* Root sections */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        {/* Pinned section — shown above tree when bookmarks exist */}
        <PinnedSection
          bookmarks={bookmarks}
          activeFilePath={activeFilePath}
          onFileSelect={onFileSelect}
          onUnpin={(path) => void handleUnpin(path)}
        />

        {roots.map((root) => (
          <RootSection
            key={root}
            root={root}
            isExpanded={expandedRoots.has(root)}
            onToggle={() => toggleRoot(root)}
            activeFilePath={activeFilePath}
            onFileSelect={onFileSelect}
            onRemove={roots.length > 1 && onRemoveRoot ? () => onRemoveRoot(root) : undefined}
            bookmarks={bookmarks}
            extraIgnorePatterns={extraIgnorePatterns}
          />
        ))}

        {/* Cross-root search results */}
        {query.trim().length > 0 && (
          <SearchOverlay
            roots={roots}
            query={query}
            activeFilePath={activeFilePath}
            onFileSelect={(path) => {
              onFileSelect(path);
              setQuery('');
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── SearchOverlay ────────────────────────────────────────────────────────────

interface SearchOverlayProps {
  roots: string[];
  query: string;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
}

/**
 * SearchOverlay — collects all loaded file nodes across all roots and performs
 * a cross-root fuzzy search using Fuse.js.
 *
 * Because tree nodes live inside each RootSection's local state and are
 * inaccessible from here, we do a fresh recursive directory scan when the
 * query changes. Results are shown in a floating overlay above the tree.
 */
function SearchOverlay({
  roots,
  query,
  activeFilePath,
  onFileSelect,
}: SearchOverlayProps): React.ReactElement {
  const [allFiles, setAllFiles] = useState<TreeNode[]>([]);

  // Re-scan roots when query becomes non-empty or roots change
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;

    async function scanRoot(root: string): Promise<TreeNode[]> {
      const result = await window.electronAPI.files.readDir(root);
      if (!result.success || !result.items) return [];

      const nodes: TreeNode[] = [];
      for (const item of result.items) {
        if (
          item.name.startsWith('.') ||
          IGNORED_DIRS_BASE.has(item.name)
        ) continue;

        const rel = relPath(root, item.path);
        if (!item.isDirectory) {
          nodes.push({
            name: item.name,
            path: item.path,
            relativePath: rel,
            isDirectory: false,
            depth: 0,
            isExpanded: false,
            isLoading: false,
          });
        } else {
          // Recurse one level deep for a quick but useful result set
          const children = await scanRoot(item.path);
          nodes.push(...children);
        }
      }
      return nodes;
    }

    void Promise.all(roots.map(scanRoot)).then((results) => {
      if (!cancelled) setAllFiles(results.flat());
    });

    return () => { cancelled = true; };
  }, [query, roots]);

  const fuse = useMemo(
    () =>
      new Fuse(allFiles, {
        keys: ['relativePath', 'name'],
        threshold: 0.4,
        includeMatches: true,
        minMatchCharLength: 1,
      }),
    [allFiles]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 50).map((result) => {
      const ranges: MatchRange[] = [];
      if (result.matches) {
        for (const match of result.matches) {
          if (match.key === 'name' && match.indices) {
            for (const [start, end] of match.indices) {
              ranges.push({ start, end: end + 1 });
            }
          }
        }
      }
      return { node: result.item, ranges };
    });
  }, [query, fuse]);

  if (searchResults.length === 0) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--bg-secondary)',
          zIndex: 10,
          padding: '16px 12px',
          color: 'var(--text-faint)',
          fontSize: '0.8125rem',
          textAlign: 'center',
        }}
      >
        No files match "{query}"
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg-secondary)',
        zIndex: 10,
        overflowY: 'auto',
      }}
    >
      {searchResults.map(({ node, ranges }) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          isActive={node.path === activeFilePath}
          isFocused={false}
          searchMode={true}
          matchRanges={ranges}
          isBookmarked={false}
          isEditing={false}
          onClick={(n) => onFileSelect(n.path)}
          onContextMenu={() => {}}
        />
      ))}
    </div>
  );
}
