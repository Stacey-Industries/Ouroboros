/**
 * RootSection — renders one project root's collapsible file tree with
 * virtual scrolling, git status, context menu, drag-and-drop, inline
 * rename/create, and file watcher auto-refresh.
 *
 * Extracted from FileTree.tsx to reduce file size.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import type { TreeNode } from './FileTreeItem';
import { FileTreeItem } from './FileTreeItem';
import { FolderTypeIcon } from './FileTypeIcon';
import { ContextMenu, INITIAL_CONTEXT_MENU } from './ContextMenu';
import type { ContextMenuState } from './ContextMenu';
import { FileTreeSkeleton } from '../shared';
import { useGitStatus } from '../../hooks/useGitStatus';
import { useToastContext } from '../../contexts/ToastContext';
import type { FileChangeEvent } from '../../types/electron';
import { FolderIcon } from './FolderIcon';
import {
  ITEM_HEIGHT,
  OVERSCAN,
  buildIgnorePredicate,
  loadDirChildren,
  normPath,
  basename,
  updateNodeInTree,
  removeNodeFromTree,
  flattenVisibleTree,
  getNodeGitStatus,
  pathJoin,
  parentDir,
} from './fileTreeUtils';
import type { EditState } from './fileTreeUtils';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RootSectionProps {
  root: string;
  isExpanded: boolean;
  onToggle: () => void;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onRemove?: () => void;
  bookmarks: string[];
  extraIgnorePatterns: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RootSection({
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
