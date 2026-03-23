# FileTree — Multi-Root Hierarchical File Browser

VS Code-style file tree with git integration, virtual scrolling, inline rename, context menus, file nesting, and a Zustand store being incrementally migrated away from local React state.

## Component Hierarchy

```
FileTree ← public entry point; resolves roots, owns heat map toggle
FileTreeContent ← adds git chrome (branch indicator, filter bar)
  GitBranchIndicator ← branch switcher dropdown
  FileTreeSearchBar ← search input + heat map toggle
  GitStatusFilterBar ← filter buttons (all/modified/staged/untracked)
  FileTreeBody ← routes between normal tree / git-filtered flat list
    StagingArea ← collapsible staged/unstaged changes panel
    PinnedSection ← bookmarked files (persisted to config)
    RootSection ← one section per project root
      VirtualTreeList ← virtualized rows (custom, not react-window)
        FileTreeItem ← single row: file or directory
          TreeItemFile / TreeItemDirectory
          FileTypeIcon / FolderIcon
    SearchOverlay ← floating results when query is non-empty
    GitFilteredView ← flat file list when a git filter is active
```

## Key Files

| File                          | Role                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `FileTree.tsx`                | Public entry; resolves `projectRoots`/`projectRoot` props, owns heat map toggle                   |
| `FileTreeBody.tsx`            | Routes: git-filter active → `GitFilteredView`; else → pinned + roots + search overlay             |
| `fileTreeStore.ts`            | Zustand + immer + persist store; **single source of truth for UI state**                          |
| `VirtualTreeList.tsx`         | Custom virtualized list — renders only visible rows via scroll position + OVERSCAN                 |
| `RootSection.tsx`             | Per-root subtree; orchestrates keyboard nav via `rootSectionKeys.ts`                              |
| `useRootTreeState.ts`         | Loads tree data from IPC, handles lazy dir expansion, file-watch subscriptions                     |
| `useRootSectionInteractions.ts` | Click, drag-drop, rename, delete, multi-select for a root                                        |
| `useContextMenuController.ts` | Builds context menu items based on node type, git status, selection                                |
| `fileTreeUtils.ts`            | `flattenVisibleTree`, `loadDirChildren`, `buildIgnorePredicate`, `ITEM_HEIGHT`                     |
| `fileNestingRules.ts`         | VS Code-style nesting rules (`*.ts` groups `*.test.ts`, `*.d.ts`, etc.)                            |
| `rootSectionKeys.ts`          | Keyboard handler (arrow keys, Enter, Delete, F2, Ctrl+A, PageUp/Down)                             |
| `StagingArea.tsx`             | Stage/unstage/discard per-file actions; calls `git:stage`, `git:unstage`, `git:discard` IPC       |
| `GitBranchIndicator.tsx`      | Branch list, checkout, create-and-checkout; calls `git:branches`, `git:checkout`                  |
| `GitStatusFilter.tsx`         | Filter bar + `GitFilteredView` flat list; reads `filter` from store                               |

## Zustand Store — Migration Status

`fileTreeStore` is being **incrementally migrated** from scattered `useState` hooks. Current state:

**In store** (use `useFileTreeStore`):
- `searchQuery`, `expandedPaths`, `filter`, `sortMode`, `editState`, `bookmarks`
- `selectedPaths`, `focusedPath` (selection/focus)
- `diagnostics` (LSP severity per path), `dirtyFiles` (unsaved editor changes)
- `nestingEnabled`, `nestExpandedPaths` (file nesting)

**Not yet in store** (still local hooks):
- `rootNodes` / tree data → `useRootTreeState`
- `gitStatus` → `useGitStatus` hook per root
- `contextMenu` open/close state → `useContextMenuState`

## Patterns & Conventions

### Virtual Scrolling (custom)
`VirtualTreeList` rolls its own virtualization: `scrollTop` + `containerHeight` → compute `startIndex`/`endIndex` with `OVERSCAN = 5` rows buffer. Fast-scroll detection skips row content rendering at `> 500 px/frame`. Item height is `ITEM_HEIGHT` constant (from `fileTreeUtils.ts`) — **do not set row heights in CSS** or the math breaks.

### File Nesting
Disabled by default; toggled via `store.toggleNesting()`. `applyNesting(nodes, rules)` in `fileNestingRules.ts` rewrites a flat sibling list into parent/children groups. Each rule uses `${basename}` substitution. Nesting is applied after tree load, not during IPC fetch.

### Context Menu
`buildMenuItems` in `contextMenuControllerHelpers.ts` produces `MenuItem[]` from node metadata + git status. Bulk operations (multi-select delete/stage) use `BulkMenuHandlers`. The `ContextMenuPanel` renders the list; `ContextMenu` owns open/close state and position.

### Inline Editing
`InlineEditInput` replaces the row label during rename or new-file creation. `EditState` in `fileTreeUtils.ts` tracks `{ type, path, parentDir }`. Confirm via Enter, cancel via Escape.

### Undo
`useFileTreeUndo` maintains a stack of `UndoItem` (deleted files/folders). Ctrl+Z triggers restore via `files:restore` IPC. Only delete operations are undoable.

### Heat Map
Optional git-frequency overlay — `useFileHeatMap` maps paths to commit frequency. Passed as `getHeatLevel?: (path) => FileHeatData` prop; undefined when disabled. Tree rows apply a colored left-border when heat data is present.

## IPC Dependencies

| IPC channel                                    | Used for                          |
| ---------------------------------------------- | --------------------------------- |
| `files:readDir`                                | Lazy-load directory children      |
| `files:rename`, `files:delete`, `files:newFile`, `files:newFolder` | Tree mutations    |
| `files:restore`                                | Undo delete                       |
| `git:status`                                   | Per-file status badges            |
| `git:stage`, `git:unstage`, `git:discard`      | StagingArea actions               |
| `git:branches`, `git:checkout`, `git:createBranch` | GitBranchIndicator            |
| `config:get` / `config:set`                    | Bookmarks, ignore patterns        |

## Gotchas

- **`enableMapSet()` must be called before any immer store uses `Map`/`Set`** — it's at the top of `fileTreeStore.ts`. If you add a new store file with immer + Map/Set, call it there too.
- **`ITEM_HEIGHT` is a fixed constant** — virtualization math depends on it. Never override row height with CSS without updating the constant.
- **`projectRoots` prop vs `projectRoot` prop** — `FileTree` accepts both; `resolveRoots` prefers the array. Git operations (branch indicator, staging area) use `roots[0]` as the primary root.
- **Search overlay overlays the tree** — it's `position: absolute` inside the scrollable body. When `query` is non-empty, the overlay covers pinned/root sections.
- **Git filter replaces the tree** — when `filter !== 'all'`, `GitFilteredView` renders instead of the normal tree hierarchy. The store `filter` field drives this switch.
- **`fileTreeStore` uses `persist` middleware** — `expandedPaths`, `bookmarks`, `sortMode`, `nestingEnabled` survive page reload. Be careful adding new fields: they will be persisted by default. Use the `partialize` option if a field should not persist.
