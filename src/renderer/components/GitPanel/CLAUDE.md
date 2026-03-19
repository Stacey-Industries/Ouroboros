<!-- claude-md-auto:start -->

The CLAUDE.md already exists in this directory (loaded from the system reminder). Here's what was generated:

```markdown
# GitPanel — Git staging, committing, and branch switching UI

## Key Files

| File                         | Role                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitPanel.tsx`               | Entry point — connects `ProjectContext` to the model hook, spreads model as props into content                                                                        |
| `GitPanelContent.tsx`        | Pure presentational component — renders staged/unstaged file lists, commit form, error banner. All state received via props.                                          |
| `useGitPanelModel.ts`        | State + logic hook — owns all git operations (stage, unstage, commit, checkout, discard) via `window.electronAPI.git.*` IPC calls. Exports `GitPanelModel` interface. |
| `useGitPanelModel.shared.ts` | Shared types and pure utility functions — extracted for testability. `runGitMutation` is the standard wrapper for all mutating git ops.                               |
| `GitFileRow.tsx`             | Single file row — status badge (color-coded M/A/D/R/?), path display (dir + filename split), stage/unstage and discard buttons.                                       |
| `BranchSelector.tsx`         | Branch dropdown — click-outside dismissal via `useDropdownDismiss` internal hook.                                                                                     |
| `index.ts`                   | Barrel — exports `GitPanel`, `GitFileRow`, `BranchSelector`                                                                                                           |

## Architecture

**Strict model/view separation**: `GitPanel.tsx` is a thin connector — pulls `projectRoot` from `ProjectContext`, instantiates `useGitPanelModel(projectRoot)`, and spreads the entire model into `GitPanelContent`. The content component has zero IPC awareness.

**Git operations pattern**: Every mutation goes through `runGitMutation` (from `.shared.ts`), which guards against null `projectRoot`, executes the operation, then calls `refreshStatus()`. Never call `refreshStatus()` manually after a mutation — `runGitMutation` does it.

## Core Types

- **`GitStatusMap`** = `Record<string, string>` — keys are file paths, values are status codes (M, A, D, R, ?)
- **`GitFileEntry`** = `[string, string]` tuple — `[filePath, statusCode]`, sorted alphabetically via `sortEntries()`
- **`GitPanelModel`** — flat interface of data + callbacks; the full contract between hook and view

## Conventions

- **Two-click discard**: `GitFileRow` requires a confirmation click before discarding — `useDiscardConfirmation` manages the confirm state with auto-reset timeout
- **Status badge colors**: M=warning/yellow, A=success/green, D=error/red, R=info/blue, ?=muted — via CSS custom properties with hardcoded fallbacks
- **Commit shortcut**: `Ctrl+Enter` in the commit textarea triggers commit via `handleKeyDown` in the model

## Dependencies

- **Upstream**: `ProjectContext` (`src/renderer/contexts/`) for `projectRoot`
- **IPC channels**: `git.status`, `git.stage`, `git.unstage`, `git.stageAll`, `git.unstageAll`, `git.commit`, `git.checkout`, `git.branches`, `git.discardFile`
- **IPC types**: `src/renderer/types/electron-git.d.ts`

## Gotchas

- `isRepo` starts as `null` (unknown) until the first status check resolves — the panel renders a neutral empty state during this window, not an error
- Branch list is **local branches only** — no remote tracking branches
- `refreshStatus` fires on mount and after every mutation — duplicate renders are expected and harmless
```

`★ Insight ─────────────────────────────────────`

- The `.shared.ts` split is a testability pattern worth noting: types + pure functions (`runGitMutation`, `sortEntries`) live there, importable without mounting React. This is the right place for any future git utility logic too.
- `GitPanelModel` is intentionally flat — no nested objects, just primitives and `() => Promise<void>` callbacks. The `{...model}` spread in `GitPanel.tsx` only works cleanly because of this shape discipline.
- `isRepo: null | boolean` is a deliberate tri-state: `null` = loading (haven't checked), `false` = checked/not a repo, `true` = it's a repo. Collapsing to `boolean` would lose the loading window distinction.
  `─────────────────────────────────────────────────`

The file was already written to disk (visible in the system context). The key architectural insight worth remembering: this panel is one of the cleanest model/view separations in the codebase — the content component is purely presentational with zero IPC knowledge, all side effects are funneled through `runGitMutation` in the shared module.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# GitPanel — Git staging, committing, and branch switching UI

## Key Files

| File                         | Role                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitPanel.tsx`               | Entry point — connects `ProjectContext` to the model hook, spreads model as props into content                                                                        |
| `GitPanelContent.tsx`        | Pure presentational component — renders staged/unstaged file lists, commit form, error banner. All state received via props.                                          |
| `useGitPanelModel.ts`        | State + logic hook — owns all git operations (stage, unstage, commit, checkout, discard) via `window.electronAPI.git.*` IPC calls. Exports `GitPanelModel` interface. |
| `useGitPanelModel.shared.ts` | Shared types and pure utility functions — extracted for testability. `runGitMutation` is the standard wrapper for all mutating git ops.                               |
| `GitFileRow.tsx`             | Single file row — status badge (color-coded M/A/D/R/?), path display (dir + filename split), stage/unstage and discard buttons.                                       |
| `BranchSelector.tsx`         | Branch dropdown — click-outside dismissal via `useDropdownDismiss` internal hook.                                                                                     |
| `index.ts`                   | Barrel — exports `GitPanel`, `GitFileRow`, `BranchSelector`                                                                                                           |

## Architecture

**Strict model/view separation**: `GitPanel.tsx` is a thin connector — pulls `projectRoot` from `ProjectContext`, instantiates `useGitPanelModel(projectRoot)`, and spreads the entire model into `GitPanelContent`. The content component has zero IPC awareness.

**Git operations pattern**: Every mutation goes through `runGitMutation` (from `.shared.ts`), which guards against null `projectRoot`, executes the operation, then calls `refreshStatus()`. Never call `refreshStatus()` manually after a mutation — `runGitMutation` does it.

## Core Types

- **`GitStatusMap`** = `Record<string, string>` — keys are file paths, values are status codes (M, A, D, R, ?)
- **`GitFileEntry`** = `[string, string]` tuple — `[filePath, statusCode]`, sorted alphabetically via `sortEntries()`
- **`GitPanelModel`** — flat interface of data + callbacks; the full contract between hook and view

## Conventions

- **Two-click discard**: `GitFileRow` requires a confirmation click before discarding — `useDiscardConfirmation` manages the confirm state with auto-reset timeout
- **Status badge colors**: M=warning/yellow, A=success/green, D=error/red, R=info/blue, ?=muted — via CSS custom properties with hardcoded fallbacks
- **Commit shortcut**: `Ctrl+Enter` in the commit textarea triggers commit via `handleKeyDown` in the model

## Dependencies

- **Upstream**: `ProjectContext` (`src/renderer/contexts/`) for `projectRoot`
- **IPC channels**: `git.status`, `git.stage`, `git.unstage`, `git.stageAll`, `git.unstageAll`, `git.commit`, `git.checkout`, `git.branches`, `git.discardFile`
- **IPC types**: `src/renderer/types/electron-git.d.ts`

## Gotchas

- `isRepo` starts as `null` (unknown) until the first status check resolves — the panel renders a neutral empty state during this window, not an error
- Branch list is **local branches only** — no remote tracking branches
- `refreshStatus` fires on mount and after every mutation — duplicate renders are expected and harmless
