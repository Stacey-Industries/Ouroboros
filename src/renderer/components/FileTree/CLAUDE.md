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

| File | Role |
| --- | --- |
| `FileTree.tsx` | Public entry; resolves `projectRoots`/`projectRoot` props, owns heat map toggle |
| `FileTreeBody.tsx` | Routes: git-filter active → `GitFilteredView`; else → pinned + roots + search overlay |
| `fileTreeStore.ts` | Zustand + immer + persist store; **single source of truth for UI state** |
| `fileTreeStoreActionsImpl.ts` | Action creators extracted from store (40-line ESLint limit) — do not add actions elsewhere |
| `fileTreeStoreSelectors.ts` | Selector hooks re-exported through `fileTreeStore.ts` for backward compatibility |
| `VirtualTreeList.tsx` | Custom virtualized list — renders only visible rows via scroll position + OVERSCAN |
| `RootSection.tsx` | Per-root subtree; delegates all logic to `useRootSectionModel` |
| `useRootSectionModel.ts` | **Facade hook** — assembles tree, selection, editing, drag-drop, keyboard, undo into one return value for `RootSection` |
| `useRootTreeState.ts` | Loads tree data from IPC, handles lazy dir expansion, file-watch subscriptions |
| `useRootSectionInteractions.ts` | Individual interaction hooks: `useRootSelection`, `useRootEditing`, `useDropHandlers`, `useMenuActions`, `useRootKeyboard`, etc. |
| `useContextMenuController.ts` | Builds `MenuItem[]` from node type + git status + selection; delegates to `contextMenuControllerHelpers.ts` |
| `fileTreeUtils.ts` | `flattenVisibleTree`, `loadDirChildren`, `buildIgnorePredicate`, `ITEM_HEIGHT` |
| `fileNestingRules.ts` | VS Code-style nesting rules (`*.ts` groups `*.test.ts`, `*.d.ts`, etc.) |
| `rootSectionKeys.ts` | Keyboard handler (arrow keys, Enter, Delete, F2, Ctrl+A, PageUp/Down) |
| `rootSectionHandlers.ts` | File operation implementations: rename, delete, new file/folder, drag-drop |
| `GitBranchIndicator.tsx` | Branch list, checkout, create-and-checkout; calls `git:branches`, `git:checkout` |
| `GitStatusFilter.tsx` | Filter bar + `GitFilteredView` flat list; reads `filter` from store |
| `ProjectPicker.tsx` | Folder picker dropdown — used in layout header to switch/add project roots |
| `useProjectPickerController.ts` | All state + handlers for ProjectPicker (open/close, recents, native folder dialog) |

## Zustand Store — Three-File Split

The store is split to satisfy the 40-line `max-lines-per-function` ESLint rule:

| File | Contents |
| --- | --- |
| `fileTreeStore.ts` | Store shape (`FileTreeState`), `create()`, `persist` config, re-exports from selectors |
| `fileTreeStoreActionsImpl.ts` | `createFileTreeActions(set)` — all action implementations. **Add new actions here.** |
| `fileTreeStoreSelectors.ts` | Individual selector hooks (`useSearchQuery`, `useExpandedPaths`, etc.) |

**In store** (use `useFileTreeStore`):
- `searchQuery`, `expandedPaths`, `filter`, `sortMode`, `editState`, `bookmarks`
- `selectedPaths`, `focusedPath`, `lastSelectedPath`
- `diagnostics` (LSP severity per path), `dirtyFiles` (unsaved editor changes)
- `nestingEnabled`, `nestExpandedPaths` (file nesting)
- `roots` (tree data per root path), `loadedDirs`, `gitStatus`

**Not yet in store** (still local hooks):
- `contextMenu` open/close state → `useContextMenuState` in `useRootSectionInteractions.ts`

## File Icon System

Five files implement VS Code extension icon theme support:

| File | Role |
| --- | --- |
| `fileIconThemeResolver.ts` | Resolution logic — `resolveFileIconUri` / `resolveFolderIconUri`; handles light/highContrast variants, multi-part extension matching |
| `fileIcons.ts` | Built-in icon ID → SVG path mappings |
| `fileTypeData.ts` | Extension → icon ID lookup table (built-in theme fallback) |
| `fileTypeIcons.tsx` | React components for built-in icons |
| `useFileIconAsset.ts` | Hook: resolves icon URI from active extension theme or falls back to built-in |
| `FileTypeIcon.tsx` | Renders `<img>` (extension theme) or built-in SVG component |

Resolution order in `resolveFileIconUri`: exact filename match → longest extension suffix match → default file icon. Folder icons also check root vs non-root variant and open vs closed state.

## Patterns & Conventions

### `useRootSectionModel` — the real coordinator
`RootSection.tsx` is thin — it calls `useRootSectionModel` and passes the result to child components. When debugging `RootSection` behavior, start in `useRootSectionModel.ts`, not `RootSection.tsx`. The model's `buildKeyboardDeps`, `buildStateProps`, `buildHandlerProps` helpers are also split for the 40-line limit.

### Virtual Scrolling (custom)
`VirtualTreeList` rolls its own virtualization: `scrollTop` + `containerHeight` → compute `startIndex`/`endIndex` with `OVERSCAN = 5` rows buffer. Fast-scroll detection (> 500 px/frame) skips every other row during the scroll. Item height is `ITEM_HEIGHT` constant (from `fileTreeUtils.ts`) — **do not set row heights in CSS** or the math breaks. The scroll parent is found by walking up the DOM for `overflow-y: auto/scroll`.

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

| IPC channel | Used for |
| --- | --- |
| `files:readDir` | Lazy-load directory children |
| `files:rename`, `files:delete`, `files:newFile`, `files:newFolder` | Tree mutations |
| `files:restore` | Undo delete |
| `git:status` | Per-file status badges |
| `git:branches`, `git:checkout`, `git:createBranch` | GitBranchIndicator |
| `config:get` / `config:set` | Bookmarks, ignore patterns |

## Gotchas

- **`enableMapSet()` must be called before any immer store uses `Map`/`Set`** — it's at the top of `fileTreeStore.ts`. If you add a new store file with immer + Map/Set, call it there too.
- **`ITEM_HEIGHT` is a fixed constant** — virtualization math depends on it. Never override row height with CSS without updating the constant.
- **`fileTreeStore` uses `persist` middleware** — `expandedPaths`, `bookmarks`, `sortMode`, `nestingEnabled` survive page reload. New fields added to the store shape are **not** persisted by default — they must be listed in the `partialize` option to opt in.
- **`projectRoots` prop vs `projectRoot` prop** — `FileTree` accepts both; `resolveRoots` prefers the array. Git operations (branch indicator, staging area) use `roots[0]` as the primary root.
- **Search overlay overlays the tree** — it's `position: absolute` inside the scrollable body. When `query` is non-empty, the overlay covers pinned/root sections.
- **Git filter replaces the tree** — when `filter !== 'all'`, `GitFilteredView` renders instead of the normal tree hierarchy. The store `filter` field drives this switch.
- **`*.helpers.tsx` files are internal** — `GitBranchIndicator.helpers.tsx`, `GitStatusFilter.helpers.tsx`, `PinnedSection.parts.tsx`, `ProjectPickerMenu.parts.tsx`, `ProjectPickerMenu.styles.ts` are implementation details; do not import from outside `FileTree/`.
- **`diagnostics` in store are not yet wired** — `updateDiagnostics` action exists but nothing calls it. Marked as TODO in the store: requires an LSP bridge caller.
