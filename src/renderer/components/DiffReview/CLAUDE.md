# DiffReview — Per-Hunk Accept/Reject UI for Agent Diffs

Presents a code review interface for agent-generated changes: users can accept (stage) or reject (revert) individual hunks or entire files before committing.

## Key Files

| File                          | Role                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `types.ts`                    | Domain types: `HunkDecision` (`pending`/`accepted`/`rejected`), `ReviewHunk`, `ReviewFile`, `DiffReviewState` |
| `DiffReviewManager.tsx`       | Context provider (`DiffReviewProvider`) + `useDiffReview()` hook — mounts above the panel in the tree         |
| `diffReviewState.ts`          | All state logic: reducer, action types, three action-hook groups, IPC calls                                   |
| `DiffReviewPanel.tsx`         | Stateful shell — owns `selectedFileIdx`, `fileRefs` map, scroll-on-select effect, delegates to layout         |
| `DiffReviewPanelState.tsx`    | Pure helpers: `getDiffReviewStats()` and `getDiffReviewStateView()` (loading/error/empty renders)             |
| `DiffReviewPanelSections.tsx` | Layout tree: `DiffReviewLayout` → header + body → sidebar + hunk list                                         |
| `FileListSidebar.tsx`         | Left sidebar — file list with status badges, hunk progress, quick accept/reject per file                      |
| `HunkView.tsx`                | Single hunk renderer — dual gutter (left/right line numbers), diff lines, accept/reject actions               |

## Component Tree

```
DiffReviewProvider (context)
  └── DiffReviewPanel (selectedFileIdx, fileRefs, scroll)
        └── DiffReviewLayout
              ├── DiffReviewHeader (stats, accept/reject all)
              └── DiffReviewBody
                    ├── FileListSidebar
                    └── hunk scroll area
                          └── HunkView[] (per hunk)
```

## State Architecture

`diffReviewReducer` takes `DiffReviewState | null` — **null is the closed state**, not an error. Initial `useReducer` state is `null`. The reducer splits across three exported hook groups to avoid one massive hook:

| Hook                        | Actions                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `useReviewLifecycleActions` | `openReview`, `closeReview`                                |
| `useSingleHunkActions`      | `acceptHunk`, `rejectHunk`                                 |
| `useBulkReviewActions`      | `acceptAllFile`, `rejectAllFile`, `acceptAll`, `rejectAll` |

`DiffReviewManager` assembles all three into a single context value. All action callbacks close over `state` — they **must** be rebuilt when state changes (all are `useCallback` with `[dispatch, state]` deps).

## Git Operations

- **Accept** → `window.electronAPI.git.stageHunk(projectRoot, rawPatch)`
- **Reject** → `window.electronAPI.git.revertHunk(projectRoot, rawPatch)`

Both are **optimistic**: dispatch the decision immediately, roll back to `'pending'` on IPC failure.

Bulk operations are **sequential** (`for...of` await loop, not `Promise.all`) to avoid git lock contention from concurrent patch applications.

## Bulk Reject Ordering — Critical

`getPendingEntriesForFile` uses `reduceRight` (last hunk first within a file). `getPendingEntries` iterates files in reverse. This is intentional: reverting a hunk shifts line offsets for all hunks below it. Reverting in forward order would cause the second `rawPatch` to apply at the wrong offset. Always process last-to-first.

## Loading/Error/Empty Guard

`getDiffReviewStateView(state, onClose)` returns a React element for loading, error, or empty states — or `null` when the review is ready to render. `DiffReviewPanel` checks this first and returns early:

```tsx
const stateView = getDiffReviewStateView(state, onClose);
if (stateView) return stateView;
```

Do not add inline loading/error logic to `DiffReviewPanel` — add it to `getDiffReviewStateView` in `DiffReviewPanelState.tsx`.

## Styling Convention

All styling uses **inline `CSSProperties` objects with CSS vars** — no Tailwind classes anywhere in this directory. Color constants (added/removed highlight colors) are defined as module-level functions (`lineBg`, `gutterBg`, `markerColor`) to keep the JSX clean. Do not introduce Tailwind utilities here — it would break the visual consistency.

## IPC Dependencies

- `window.electronAPI.git.diffReview(projectRoot, snapshotHash)` — loads `FileDiff[]`, called on `openReview`
- `window.electronAPI.git.stageHunk(projectRoot, rawPatch)` — stages a single hunk
- `window.electronAPI.git.revertHunk(projectRoot, rawPatch)` — reverts a single hunk

All three return `{ success: boolean; error?: string }`. Type source: `src/renderer/types/electron.d.ts`.
