/**
 * fileTreeStore — Zustand store for file tree state.
 *
 * ## Migration Guide (for future agents)
 *
 * This store is being introduced incrementally alongside existing React hooks.
 * The migration pattern is:
 *
 * 1. **Identify the state** you want to migrate (e.g., searchQuery, expandedPaths).
 * 2. **Add it to the store** shape below with an action to update it.
 * 3. **In the component**, replace `useState`/hook usage with `useFileTreeStore(s => s.field)`.
 * 4. **Keep the old hook** alive temporarily — wire it to read from the store so
 *    downstream consumers that haven't migrated yet still work.
 * 5. **Once all consumers** read from the store, remove the old hook.
 *
 * Currently migrated:
 * - `searchQuery` (was useState in FileTree.tsx → useSearchQuery)
 * - `expandedPaths` (root-level expand/collapse, was useState in FileTree.tsx → useExpandedRoots)
 *
 * Not yet migrated (still in hooks):
 * - `rootNodes` / tree data (useRootTreeState)
 * - `selectedPaths` / `focusIndex` (useRootSelection)
 * - `editState` (useRootEditing)
 * - `contextMenu` state (useContextMenuState)
 * - `gitStatus` (useGitStatus hook)
 * - `bookmarks` (useFileTreeConfig)
 */

import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

// Must be called before any immer-based store uses Map/Set
enableMapSet();
import type { TreeNode } from './FileTreeItem';
import type { GitFileStatus } from '../../types/electron';
import type { EditState } from './fileTreeUtils';
import { flattenVisibleTree } from './fileTreeUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TreeFilter = 'all' | 'modified' | 'staged' | 'untracked';
export type SortMode = 'name' | 'modified' | 'type';
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface FileTreeState {
  // ─── Data (per root) ─────────────────────────────────────────────────────
  /** Loaded tree data per root path */
  roots: Map<string, TreeNode[]>;
  /** Which directories have been loaded from disk */
  loadedDirs: Set<string>;
  /** Relative file path -> git status character, per root */
  gitStatus: Map<string, GitFileStatus>;

  // ─── Selection ───────────────────────────────────────────────────────────
  /** Multi-selection: set of selected file/folder paths */
  selectedPaths: Set<string>;
  /** Currently focused path (keyboard navigation) */
  focusedPath: string | null;
  /** Last selected path for shift-click range selection */
  lastSelectedPath: string | null;

  // ─── UI state ────────────────────────────────────────────────────────────
  /** Which directories are expanded (full paths) */
  expandedPaths: Set<string>;
  /** Inline edit state (rename, new file, new folder) */
  editState: EditState | null;
  /** Search query text */
  searchQuery: string;
  /** File status filter */
  filter: TreeFilter;
  /** Sort order */
  sortMode: SortMode;
  /** Pinned/bookmarked file paths */
  bookmarks: string[];

  // ─── Diagnostics (4A) ─────────────────────────────────────────────────────
  /** File path -> highest diagnostic severity. Populated by LSP bridge. */
  diagnostics: Map<string, DiagnosticSeverity>;

  // ─── Dirty file tracking (4C) ──────────────────────────────────────────────
  /** Files with unsaved editor changes */
  dirtyFiles: Set<string>;

  // ─── File nesting (4B) ─────────────────────────────────────────────────────
  /** Whether file nesting (grouping related files) is enabled */
  nestingEnabled: boolean;
  /** Paths of nesting-parent files whose nested children are visible */
  nestExpandedPaths: Set<string>;

  // ─── Actions ─────────────────────────────────────────────────────────────
  /** Toggle a directory's expanded/collapsed state */
  toggleExpand: (path: string) => void;
  /** Ensure a path is expanded (used when adding new roots) */
  ensureExpanded: (path: string) => void;
  /** Select a path, respecting ctrl/shift modifiers */
  select: (path: string, modifiers: { ctrl: boolean; shift: boolean }) => void;
  /** Set keyboard focus to a path */
  setFocus: (path: string | null) => void;
  /** Update the search query */
  setSearchQuery: (query: string) => void;
  /** Set the file status filter */
  setFilter: (filter: TreeFilter) => void;
  /** Set sort mode */
  setSortMode: (mode: SortMode) => void;
  /** Set inline edit state */
  setEditState: (state: EditState | null) => void;
  /** Update git status map (replaces entire map for a root) */
  updateGitStatus: (status: Map<string, GitFileStatus>) => void;
  /** Toggle a bookmark */
  toggleBookmark: (path: string) => void;
  /** Set bookmarks array (for syncing from config) */
  setBookmarks: (bookmarks: string[]) => void;
  /** Store loaded tree nodes for a root */
  setRootNodes: (rootPath: string, nodes: TreeNode[]) => void;
  /** Mark a directory as loaded */
  markDirLoaded: (dirPath: string) => void;
  /** Clear all loaded dirs (used on root reload) */
  clearLoadedDirs: () => void;
  /** Select all visible items in the tree */
  selectAll: () => void;
  /** Toggle selection of a single path without clearing others */
  toggleSelection: (path: string) => void;
  /** Clear all selection */
  clearSelection: () => void;

  // ─── Diagnostic actions (4A) ────────────────────────────────────────────
  /**
   * Replace the entire diagnostics map.
   * TODO: Call this from the LSP bridge when diagnostics are received.
   */
  updateDiagnostics: (diagnostics: Map<string, DiagnosticSeverity>) => void;

  // ─── Dirty file actions (4C) ────────────────────────────────────────────
  /** Mark a file as having unsaved changes */
  markDirty: (path: string) => void;
  /** Mark a file as clean (saved or discarded) */
  markClean: (path: string) => void;

  // ─── File nesting actions (4B) ──────────────────────────────────────────
  /** Toggle file nesting on/off */
  toggleNesting: () => void;
  /** Toggle expansion of nested children for a file path */
  toggleNestExpansion: (path: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get all visible (expanded) tree nodes across all roots, flattened in display order.
 * Used for shift-click range selection and selectAll.
 */
function getAllFlattenedNodes(state: FileTreeState): TreeNode[] {
  const result: TreeNode[] = [];
  for (const [, nodes] of state.roots) {
    result.push(...flattenVisibleTree(nodes));
  }
  return result;
}

// ─── Store ───────────────────────────────────────────────────────────────────

/**
 * The persist middleware needs JSON-serializable state. Sets and Maps are
 * converted to/from arrays during serialization.
 */
export const useFileTreeStore = create<FileTreeState>()(
  persist(
    immer((set) => ({
      // ─── Initial state ─────────────────────────────────────────────────
      roots: new Map(),
      loadedDirs: new Set(),
      gitStatus: new Map(),
      selectedPaths: new Set(),
      focusedPath: null,
      lastSelectedPath: null,
      expandedPaths: new Set(),
      editState: null,
      searchQuery: '',
      filter: 'all' as TreeFilter,
      sortMode: 'name' as SortMode,
      bookmarks: [],
      diagnostics: new Map(),
      dirtyFiles: new Set(),
      nestingEnabled: false,
      nestExpandedPaths: new Set(),

      // ─── Actions ───────────────────────────────────────────────────────

      toggleExpand: (path: string) => {
        set((state) => {
          if (state.expandedPaths.has(path)) {
            state.expandedPaths.delete(path);
          } else {
            state.expandedPaths.add(path);
          }
        });
      },

      ensureExpanded: (path: string) => {
        set((state) => {
          state.expandedPaths.add(path);
        });
      },

      select: (path: string, modifiers: { ctrl: boolean; shift: boolean }) => {
        set((state) => {
          if (modifiers.shift && state.lastSelectedPath) {
            // Shift+Click: range select on flattened visible list
            const allNodes = getAllFlattenedNodes(state);
            const lastIdx = allNodes.findIndex((n) => n.path === state.lastSelectedPath);
            const clickIdx = allNodes.findIndex((n) => n.path === path);

            if (lastIdx === -1 || clickIdx === -1) {
              // Fallback to single select if anchor not visible
              state.selectedPaths.clear();
              state.selectedPaths.add(path);
            } else {
              const start = Math.min(lastIdx, clickIdx);
              const end = Math.max(lastIdx, clickIdx);
              // If not holding ctrl, clear first
              if (!modifiers.ctrl) {
                state.selectedPaths.clear();
              }
              for (let i = start; i <= end; i++) {
                state.selectedPaths.add(allNodes[i].path);
              }
            }
            // Don't update lastSelectedPath on shift-click to allow extending range
          } else if (modifiers.ctrl) {
            // Ctrl+Click: toggle individual item
            if (state.selectedPaths.has(path)) {
              state.selectedPaths.delete(path);
            } else {
              state.selectedPaths.add(path);
            }
            state.lastSelectedPath = path;
          } else {
            // Plain click: clear selection, select only clicked item
            state.selectedPaths.clear();
            state.selectedPaths.add(path);
            state.lastSelectedPath = path;
          }
          state.focusedPath = path;
        });
      },

      setFocus: (path: string | null) => {
        set((state) => {
          state.focusedPath = path;
        });
      },

      setSearchQuery: (query: string) => {
        set((state) => {
          state.searchQuery = query;
        });
      },

      setFilter: (filter: TreeFilter) => {
        set((state) => {
          state.filter = filter;
        });
      },

      setSortMode: (mode: SortMode) => {
        set((state) => {
          state.sortMode = mode;
        });
      },

      setEditState: (editState: EditState | null) => {
        set((state) => {
          state.editState = editState;
        });
      },

      updateGitStatus: (status: Map<string, GitFileStatus>) => {
        set((state) => {
          state.gitStatus = status;
        });
      },

      toggleBookmark: (path: string) => {
        set((state) => {
          const idx = state.bookmarks.indexOf(path);
          if (idx >= 0) {
            state.bookmarks.splice(idx, 1);
          } else {
            state.bookmarks.push(path);
          }
        });
      },

      setBookmarks: (bookmarks: string[]) => {
        set((state) => {
          state.bookmarks = bookmarks;
        });
      },

      setRootNodes: (rootPath: string, nodes: TreeNode[]) => {
        set((state) => {
          state.roots.set(rootPath, nodes);
        });
      },

      markDirLoaded: (dirPath: string) => {
        set((state) => {
          state.loadedDirs.add(dirPath);
        });
      },

      clearLoadedDirs: () => {
        set((state) => {
          state.loadedDirs.clear();
        });
      },

      selectAll: () => {
        set((state) => {
          const allNodes = getAllFlattenedNodes(state);
          state.selectedPaths.clear();
          for (const node of allNodes) {
            state.selectedPaths.add(node.path);
          }
        });
      },

      toggleSelection: (path: string) => {
        set((state) => {
          if (state.selectedPaths.has(path)) {
            state.selectedPaths.delete(path);
          } else {
            state.selectedPaths.add(path);
          }
        });
      },

      clearSelection: () => {
        set((state) => {
          state.selectedPaths.clear();
        });
      },

      // ─── Diagnostics (4A) ───────────────────────────────────────────

      updateDiagnostics: (diagnostics: Map<string, DiagnosticSeverity>) => {
        set((state) => {
          state.diagnostics = diagnostics;
        });
      },

      // ─── Dirty files (4C) ───────────────────────────────────────────

      markDirty: (path: string) => {
        set((state) => {
          state.dirtyFiles.add(path);
        });
      },

      markClean: (path: string) => {
        set((state) => {
          state.dirtyFiles.delete(path);
        });
      },

      // ─── File nesting (4B) ──────────────────────────────────────────

      toggleNesting: () => {
        set((state) => {
          state.nestingEnabled = !state.nestingEnabled;
        });
      },

      toggleNestExpansion: (path: string) => {
        set((state) => {
          if (state.nestExpandedPaths.has(path)) {
            state.nestExpandedPaths.delete(path);
          } else {
            state.nestExpandedPaths.add(path);
          }
        });
      },
    })),
    {
      name: 'file-tree-store',
      /**
       * Only persist UI preferences — not ephemeral data like tree nodes,
       * git status, selection, or edit state.
       */
      partialize: (state) => ({
        expandedPaths: state.expandedPaths,
        sortMode: state.sortMode,
        filter: state.filter,
        bookmarks: state.bookmarks,
        nestingEnabled: state.nestingEnabled,
      }),
      storage: {
        getItem: (name) => {
          const raw = localStorage.getItem(name);
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw);
            // Rehydrate expandedPaths from array to Set
            if (parsed?.state?.expandedPaths && Array.isArray(parsed.state.expandedPaths)) {
              parsed.state.expandedPaths = new Set(parsed.state.expandedPaths);
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          // Serialize expandedPaths Set to array for JSON storage
          const serializable = { ...value };
          if (serializable.state?.expandedPaths instanceof Set) {
            serializable.state = {
              ...serializable.state,
              expandedPaths: Array.from(serializable.state.expandedPaths),
            };
          }
          localStorage.setItem(name, JSON.stringify(serializable));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);

// ─── Selector hooks ──────────────────────────────────────────────────────────

/** Read the search query from the store */
export function useSearchQuery(): string {
  return useFileTreeStore((s) => s.searchQuery);
}

/** Read the expanded paths set from the store */
export function useExpandedPaths(): Set<string> {
  return useFileTreeStore((s) => s.expandedPaths);
}

/** Check if a specific path is expanded */
export function useIsExpanded(path: string): boolean {
  return useFileTreeStore((s) => s.expandedPaths.has(path));
}

/** Get the current filter */
export function useTreeFilter(): TreeFilter {
  return useFileTreeStore((s) => s.filter);
}

/** Get the current sort mode */
export function useSortMode(): SortMode {
  return useFileTreeStore((s) => s.sortMode);
}

/** Get the selected paths set */
export function useSelectedPaths(): Set<string> {
  return useFileTreeStore((s) => s.selectedPaths);
}

/** Get the focused path */
export function useFocusedPath(): string | null {
  return useFileTreeStore((s) => s.focusedPath);
}

/** Get the selection count */
export function useSelectionCount(): number {
  return useFileTreeStore((s) => s.selectedPaths.size);
}

// ─── Diagnostic selectors (4A) ───────────────────────────────────────────────

const SEVERITY_PRIORITY: Record<DiagnosticSeverity, number> = {
  error: 4,
  warning: 3,
  info: 2,
  hint: 1,
};

/** Get the diagnostic severity for a specific file path */
export function useDiagnosticForPath(path: string): DiagnosticSeverity | undefined {
  return useFileTreeStore((s) => s.diagnostics.get(path));
}

/**
 * Get the worst diagnostic severity among all children of a directory.
 * Scans the diagnostics map for paths that start with `dirPath/`.
 */
export function useDirectoryDiagnostic(dirPath: string): DiagnosticSeverity | undefined {
  return useFileTreeStore((s) => {
    const prefix = dirPath.replace(/\\/g, '/') + '/';
    let worst: DiagnosticSeverity | undefined;
    let worstP = 0;
    for (const [filePath, severity] of s.diagnostics) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (normalizedPath.startsWith(prefix)) {
        const p = SEVERITY_PRIORITY[severity] ?? 0;
        if (p > worstP) {
          worstP = p;
          worst = severity;
        }
      }
    }
    return worst;
  });
}

// ─── Dirty file selectors (4C) ───────────────────────────────────────────────

/** Check if a specific file has unsaved changes */
export function useIsDirty(path: string): boolean {
  return useFileTreeStore((s) => s.dirtyFiles.has(path));
}

/** Get the total count of dirty (unsaved) files */
export function useDirtyFileCount(): number {
  return useFileTreeStore((s) => s.dirtyFiles.size);
}

// ─── Nesting selectors (4B) ──────────────────────────────────────────────────

/** Check if file nesting is enabled */
export function useNestingEnabled(): boolean {
  return useFileTreeStore((s) => s.nestingEnabled);
}
