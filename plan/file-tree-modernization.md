# File Tree Modernization Plan

> **Goal**: Bring the file tree to VS Code/Zed-level quality with advanced search, git integration, multi-select operations, and performance at scale.
> **Current state**: Virtualized multi-root tree (28px rows, 5-item overscan), git status badges, drag-and-drop (internal move + external copy), inline editing (rename/new file/folder), context menu (15+ actions), pinned section, Fuse.js search (50 results), file heat map, keyboard navigation, undo for delete.
> **Target state**: Workspace-level search with preview, advanced git integration (staging area, diff preview on hover), multi-select bulk operations, file decorations (diagnostics, modified indicators), performance for 100K+ file projects, breadcrumb path navigation, file nesting (group related files).

---

## Architecture Decisions

### Virtualization: Keep Custom Implementation
The current manual virtualization (fixed 28px height, overscan 5) is performant and simple. Libraries like `react-window` or `@tanstack/virtual` add complexity for minimal gain at this scale. **Keep and optimize** the current approach with:
- Increase overscan to 10 for smoother scrolling
- Add scroll momentum detection (reduce renders during fast scrolling)
- Cache flattened tree to avoid re-computation on every render

### State Management: Extract to Zustand Store
The current state is scattered across 6+ hooks (`useRootSectionModel`, `useRootTreeState`, `useRootSectionInteractions`, etc.). For the complexity ahead, consolidate into a Zustand store:
- Single source of truth for tree state
- Selectors for derived data (flattened list, filtered list)
- Actions for all mutations
- Middleware for persistence and undo
- Shared across components without prop drilling

### Git Integration: First-Class, Not Bolted On
Current: git status polled every 8 seconds, shown as badges. New: git as a core data dimension with staging area, diff preview, and status filtering.

---

## Phases

### Phase 1: Foundation and State Refactor
**Parallelizable**: 1A and 1B are independent; 1C depends on both.

#### 1A. Zustand Store for File Tree State
- **Files**: New `src/renderer/components/FileTree/fileTreeStore.ts`
- **Implementation**:
  1. `npm install zustand`
  2. Define store shape:
     ```ts
     interface FileTreeStore {
       // Data
       roots: Map<string, TreeNode[]>
       loadedDirs: Set<string>
       gitStatus: Map<string, GitFileStatus>
       diagnostics: Map<string, DiagnosticSeverity>

       // Selection
       selectedPaths: Set<string>
       focusedPath: string | null
       lastSelectedPath: string | null // for shift-click range

       // UI
       expandedPaths: Set<string>
       editState: EditState | null
       searchQuery: string
       filter: TreeFilter // 'all' | 'modified' | 'staged' | 'untracked'
       sortMode: SortMode // 'name' | 'modified' | 'type'

       // Actions
       loadDir: (path: string) => Promise<void>
       toggleExpand: (path: string) => void
       select: (path: string, modifiers: { ctrl: boolean; shift: boolean }) => void
       setFilter: (filter: TreeFilter) => void
       setSortMode: (mode: SortMode) => void
       refreshGitStatus: () => Promise<void>
       // ... more actions
     }
     ```
  3. Middleware:
     - `persist` — save expanded paths, sort mode, filter to electron-store
     - `immer` — immutable updates for nested tree state
     - `devtools` — debugging in development
  4. Selectors:
     - `useFlattenedTree()` — memoized flat list for virtualization
     - `useVisibleItems()` — filtered + sorted + search-filtered
     - `useGitStatusSummary()` — counts by status type
- **Edge cases**:
  - React 18 concurrent mode — Zustand is compatible but ensure selectors don't cause tearing
  - Multiple file tree instances (split view) — share store, separate selection state
  - Store hydration on app start — load persisted state, then refresh from filesystem

#### 1B. Performance Optimization for Large Projects
- **Files**: `VirtualTreeList.tsx`, `fileTreeUtils.ts`
- **Implementation**:
  1. **Flatten cache**: Memoize `flattenVisibleTree()` result; invalidate only when expanded paths or root nodes change
  2. **Scroll momentum detection**: During rapid scrolling (>500px/frame), render every 2nd item (skip alternate rows) and fill in on scroll stop
  3. **Lazy child counting**: Don't count children for collapsed dirs; show "..." instead of exact count
  4. **Batch filesystem reads**: When expanding a dir with subdirs, prefetch first-level children of visible subdirs
  5. **Web Worker for tree operations**: Move `flattenVisibleTree`, `collectAllFiles`, `sortNodes` to a Web Worker for projects with 100K+ files
  6. **Increase overscan**: 5 → 10 for smoother fast scrolling
  7. **Debounce expansion**: When auto-expanding (e.g., from search result click), debounce 100ms to prevent rapid re-renders
- **Edge cases**:
  - `node_modules` with 100K+ files — ensure ignore predicate catches this (already does via config)
  - Circular symlinks — detect and skip (track visited inodes)
  - Network drives — filesystem reads are slow; add timeout and loading indicators
  - Race conditions during rapid expand/collapse — use abort controllers for pending reads

#### 1C. Integrate Zustand with Existing Components
- **Files**: `FileTree.tsx`, `FileTreeBody.tsx`, `RootSection.tsx`, all interaction hooks
- **Steps**:
  1. Replace `useState`/`useReducer` calls with Zustand selectors
  2. Replace hook-based actions with store actions
  3. Remove: `useRootSectionInteractions.ts` (logic moves to store actions)
  4. Simplify: `useRootSectionModel.ts` becomes a thin selector wrapper
  5. Keep: Component rendering logic unchanged
  6. Keep: `VirtualTreeList.tsx` unchanged (receives flat list from selector)
- **Edge cases**:
  - Migration must be atomic per component — don't leave half on hooks, half on store
  - Undo system (`useFileTreeUndo`) — migrate to store middleware

---

### Phase 2: Advanced Selection and Operations
**Depends on**: Phase 1
**Parallelizable within phase**: All tasks independent.

#### 2A. Multi-Select with Shift and Ctrl
- **Files**: Store actions, `FileTreeItem.tsx`
- **Implementation**:
  1. **Ctrl+Click**: Toggle individual selection (existing, enhance)
  2. **Shift+Click**: Range select from last selected to clicked item
     - Range is computed on the flattened visible list
     - All items between `lastSelectedPath` and clicked path are selected
  3. **Ctrl+A**: Select all visible items
  4. **Visual**: Selected items have highlight background; primary selected has stronger highlight
  5. **Drag multi-selected**: All selected items move together
  6. **Context menu on multi-selection**: Shows bulk actions (delete, move, stage, unstage)
- **Edge cases**:
  - Shift+Click across collapsed folders — select only visible items, not hidden children
  - Shift+Click when last selected item is no longer visible (collapsed parent) — fall back to single select
  - Select items across multiple roots — allowed but some actions may not apply
  - Selection state when tree refreshes — preserve selection if paths still exist

#### 2B. Bulk Operations
- **Files**: Store actions, `contextMenuControllerHelpers.ts`
- **Operations on multi-selection**:
  1. **Bulk delete**: Confirm dialog showing all paths, soft-delete all, single undo restores all
  2. **Bulk move**: Drag to folder or use "Move to..." command palette
  3. **Bulk stage/unstage**: Git stage or unstage all selected files
  4. **Bulk copy paths**: Copy all paths to clipboard (one per line)
  5. **Bulk open**: Open all selected files in editor tabs
  6. **Bulk add to context**: Pin all selected as context for agent chat
- **Edge cases**:
  - Bulk delete of a folder + files inside it — deduplicate (deleting the folder handles children)
  - Bulk move creates name conflicts — prompt for rename or skip
  - Bulk stage includes untracked files — `git add` handles this
  - More than 50 files selected — warn before opening all in tabs

#### 2C. Enhanced Keyboard Navigation
- **Files**: `rootSectionKeys.ts`, store actions
- **Additions**:
  | Key | Current | New |
  |---|---|---|
  | `Space` | None | Toggle selection without moving focus |
  | `Ctrl+Space` | None | Open file in preview (peek, not full tab) |
  | `Home/End` | None | Jump to first/last item |
  | `Page Up/Down` | None | Jump by viewport height |
  | `*` | None | Expand all children of focused dir |
  | `Backspace` | None | Navigate to parent dir |
  | `Ctrl+Shift+E` | None | Focus file tree from anywhere |
  | `Shift+Arrow` | None | Extend selection (shift+up/down) |
  | `Ctrl+C/V/X` | None | Copy/paste/cut files |
- **Edge cases**:
  - Copy/paste within same directory — auto-rename with "(copy)" suffix
  - Cut then navigate away — show "pending cut" indicator on source files
  - Paste into read-only location — show error

---

### Phase 3: Git Integration
**Depends on**: Phase 1
**Parallelizable with Phase 2.**

#### 3A. Staging Area View
- **Files**: New `StagingArea.tsx`, update `FileTreeBody.tsx`
- **Implementation**:
  1. New collapsible section at top of file tree: "Staged Changes (N)"
  2. Below it: "Changes (N)" showing unstaged modifications
  3. Each section lists affected files with status badges
  4. Actions per file:
     - Stage: `+` button (runs `git add`)
     - Unstage: `-` button (runs `git restore --staged`)
     - Discard changes: trash icon with confirmation (runs `git checkout --`)
     - Open diff: click file to show diff in editor
  5. Bulk actions: "Stage All", "Unstage All", "Discard All"
  6. Commit button at top of staging area → opens commit dialog
- **Edge cases**:
  - Partially staged files (some hunks staged) — show in both sections with "(partial)" indicator
  - Merge conflicts — show with "C" badge and conflict icon; click opens conflict resolver
  - Untracked files — show in "Changes" with "U" badge; stage adds to index
  - Git not initialized — hide staging area entirely
  - Submodules — show as single entry with submodule icon

#### 3B. Diff Preview on Hover
- **Files**: New `FileTreeDiffPopover.tsx`, `FileTreeItem.tsx`
- **Implementation**:
  1. When hovering over a modified file for 500ms, show a popover with:
     - Compact diff preview (first 20 changed lines)
     - "+N/-M" summary
     - "Open full diff" button
  2. Popover positions intelligently (below item, flip if near bottom)
  3. Popover stays while mouse is over it, dismisses on mouse leave
  4. For renamed files: show old name → new name
  5. For deleted files: show "File deleted" with line count
- **Edge cases**:
  - Rapid hover across multiple files — debounce 500ms, cancel previous diff computation
  - Very large diffs — truncate to 20 lines, show "... and N more changes"
  - Binary file changes — show "Binary file changed" placeholder
  - File not yet saved — show diff between disk and last commit, not in-memory changes

#### 3C. Git Status Filtering
- **Files**: Store state, `FileTreeBody.tsx`
- **Implementation**:
  1. Filter buttons in file tree toolbar:
     - All files (default)
     - Modified only
     - Staged only
     - Untracked only
     - Conflicted only
  2. When filter active, tree collapses to show only matching files (flat list with path breadcrumbs)
  3. Filter indicator: "Showing 12 modified files" at bottom
  4. Clear filter button
- **Edge cases**:
  - Filter with no results — show "No [status] files" message
  - Filter + search combined — both apply (intersection)
  - Filter resets on project change

#### 3D. Git Branch Indicator
- **Files**: `FileTree.tsx` header area
- **Implementation**:
  1. Show current branch name at top of file tree
  2. Click to show branch picker dropdown:
     - Local branches
     - Remote branches
     - Create new branch
     - Recent branches (last 5)
  3. Branch switch triggers full tree refresh + git status refresh
- **Edge cases**:
  - Dirty working tree on branch switch — warn user
  - Detached HEAD — show commit hash instead of branch name
  - Many branches (100+) — search/filter in dropdown

---

### Phase 4: File Decorations and Nesting
**Depends on**: Phase 1
**Parallelizable with Phases 2 and 3.**

#### 4A. Diagnostic Decorations
- **Files**: `FileTreeItem.tsx`, store state
- **Implementation**:
  1. Subscribe to LSP diagnostics (from editor's language server)
  2. Show severity indicators on files:
     - Error: red dot/circle
     - Warning: yellow triangle
     - Info: blue info icon
  3. Propagate to parent directories: show worst severity of children
  4. Count badge on directory: "3 errors, 2 warnings"
  5. Click diagnostic icon to jump to first error in file
- **Edge cases**:
  - Diagnostics update frequently during editing — debounce propagation to parents
  - File tree shows diagnostics for files not yet opened — skip (only show for open/analyzed files)
  - Thousands of diagnostics in a monorepo — cap propagation depth

#### 4B. File Nesting (Group Related Files)
- **Files**: New `fileNestingRules.ts`, `fileTreeUtils.ts`
- **Implementation**:
  1. Define nesting rules (like VS Code's `explorer.fileNesting`):
     ```ts
     const nestingRules = {
       '*.ts': ['${basename}.test.ts', '${basename}.spec.ts', '${basename}.d.ts'],
       '*.tsx': ['${basename}.test.tsx', '${basename}.module.css', '${basename}.stories.tsx'],
       'package.json': ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.npmrc'],
       'tsconfig.json': ['tsconfig.*.json'],
       '.env': ['.env.*'],
     }
     ```
  2. When nesting enabled, child files appear under their parent with an expand chevron
  3. Nested files shown with slightly different indent style (dotted line)
  4. Collapsed by default; expand to see related files
  5. Settings: enable/disable, custom rules
- **Edge cases**:
  - Circular nesting (a.ts nests b.ts which nests a.ts) — detect and break cycle
  - File matches multiple parents — nest under first match
  - Nested file is also in a subdirectory — don't nest (nesting only applies within same directory)
  - Nested file has its own nesting children — support recursive nesting (2 levels max)

#### 4C. Modified File Indicators
- **Files**: `FileTreeItem.tsx`
- **Implementation**:
  1. Dot indicator on files with unsaved changes in editor
  2. Color-coded: orange for unsaved, green for recently saved
  3. Subscribe to editor dirty state changes
  4. Show "N unsaved files" in tree header
- **Edge cases**:
  - File modified both in editor AND on disk — show special "conflict" indicator
  - File closed without saving — remove indicator
  - File saved in external editor — detect via file watcher, update indicator

---

### Phase 5: Search and Navigation
**Depends on**: Phase 1
**Parallelizable with all other phases.**

#### 5A. Enhanced File Search
- **Files**: `SearchOverlay.tsx`, store state
- **Upgrades to current Fuse.js search**:
  1. **Increase result limit**: 50 → 200 (virtualized rendering)
  2. **Recent files section**: Show recently opened files above search results
  3. **Search scoping**: Search within current directory (when invoked from context menu)
  4. **Path-aware search**: `src/comp` matches `src/renderer/components/...`
  5. **Symbol search**: `@functionName` searches symbols across project
  6. **Go-to-line**: `filename:123` opens file at line 123
  7. **Search by content**: Prefix with `>` to search file contents (via grep IPC)
- **Edge cases**:
  - Content search on large projects — must be async with cancellation
  - Symbol search without LSP — fall back to regex-based symbol detection
  - Very long paths — truncate middle, highlight match portion
  - Search during tree refresh — use stale index, refresh after

#### 5B. Breadcrumb Path Bar
- **Files**: New `FileTreeBreadcrumb.tsx`
- **Implementation**:
  1. Show at top of file tree when navigated deep into a directory
  2. Clickable path segments: `src > renderer > components > FileTree`
  3. Click a segment to scroll tree to that directory
  4. Dropdown on each segment showing sibling directories
  5. Keyboard: Ctrl+Shift+B to focus breadcrumb, arrow keys to navigate
- **Edge cases**:
  - Very deep paths — truncate with "..." in the middle
  - Multi-root — show root name as first segment
  - Path changes due to file tree refresh — update breadcrumb

#### 5C. Find in Tree (Filter-as-you-type)
- **Files**: `FileTree.tsx`, `fileTreeStore.ts`
- **Implementation**:
  1. Type directly in the file tree (no search box focus needed) to filter
  2. As-you-type filtering: tree collapses to show only matching items
  3. Highlighted match text in item labels
  4. Auto-expand parents of matching items
  5. Clear on Escape
  6. Different from the search overlay (5A): this filters the tree in-place rather than showing a separate overlay
- **Edge cases**:
  - Typing in tree while an item is being renamed — don't trigger filter
  - Special characters in filter — treat as literal (no regex)
  - Empty filter result — show "No files matching '[query]'" message

---

## Parallel Execution Map

```
Phase 1:
  [1A: Zustand store] ──┐
  [1B: Performance]     ├─→ [1C: Integration] ─→ Phases 2-5
                        │
Phase 2 (after Phase 1):          Phase 3 (after Phase 1):
  [2A: Multi-select]               [3A: Staging area]
  [2B: Bulk operations]            [3B: Diff on hover]
  [2C: Keyboard nav]               [3C: Status filter]
                                   [3D: Branch indicator]

Phase 4 (after Phase 1):          Phase 5 (after Phase 1):
  [4A: Diagnostics]                [5A: Enhanced search]
  [4B: File nesting]               [5B: Breadcrumb path]
  [4C: Modified indicators]        [5C: Filter-as-you-type]
```

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Zustand migration breaks existing behavior | HIGH | Migrate one root section at a time; keep old hooks as fallback |
| Performance regression on large projects | HIGH | Benchmark before/after with 100K file project; abort if slower |
| Git staging operations interfere with user's git workflow | MEDIUM | All git operations go through IPC; never modify index directly from renderer |
| File nesting rules conflict with user expectations | LOW | Disabled by default; use VS Code's rules as default when enabled |
| Multi-select + drag-and-drop interaction complexity | MEDIUM | Implement multi-select first, then add drag support incrementally |
| Web Worker serialization overhead for tree operations | LOW | Only use worker for projects > 50K files; direct computation otherwise |
