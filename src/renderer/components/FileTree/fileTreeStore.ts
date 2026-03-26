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
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Must be called before any immer-based store uses Map/Set
enableMapSet();
import type { GitFileStatus } from '../../types/electron';
import type { TreeNode } from './FileTreeItem';
import { createFileTreeActions } from './fileTreeStoreActionsImpl';
import type { EditState } from './fileTreeUtils';

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

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE = {
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
  bookmarks: [] as string[],
  diagnostics: new Map(),
  dirtyFiles: new Set(),
  nestingEnabled: false,
  nestExpandedPaths: new Set(),
};

// ─── Store ───────────────────────────────────────────────────────────────────

/**
 * The persist middleware needs JSON-serializable state. Sets and Maps are
 * converted to/from arrays during serialization.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fileTreeStateCreator = immer((set: any) => ({ ...INITIAL_STATE, ...createFileTreeActions(set) })) as any;

export const useFileTreeStore = create<FileTreeState>()(
  persist(
    fileTreeStateCreator,
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
              expandedPaths: Array.from(serializable.state.expandedPaths) as unknown as Set<string>,
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
// Re-exported from fileTreeStoreSelectors.ts for backward compatibility.
export {
  useDiagnosticForPath,
  useDirectoryDiagnostic,
  useDirtyFileCount,
  useExpandedPaths,
  useFocusedPath,
  useIsDirty,
  useIsExpanded,
  useNestingEnabled,
  useSearchQuery,
  useSelectedPaths,
  useSelectionCount,
  useSortMode,
  useTreeFilter,
} from './fileTreeStoreSelectors';
