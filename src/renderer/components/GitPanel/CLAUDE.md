<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
Three notable things about this GitPanel's architecture worth understanding:

1. **The `cancelled` flag pattern in `useGitInitialization`** is a standard React race-condition guard — when `projectRoot` changes rapidly (e.g., switching projects), the old `async/await` chain can resolve after the new one starts. The closure captures `cancelled = true` on cleanup, so stale results are silently dropped rather than overwriting fresh state.

2. **`runGitMutation` enforces refresh discipline** — by funneling all mutations through a single helper that always calls `refreshStatus()` at the end, the pattern prevents a class of bugs where a dev forgets to refresh after a stage/unstage and the UI shows stale state.

3. **`useGitPanelModel.shared.ts` exists for testability**, not just organization — pure functions (`sortEntries`, `resetRepoState`, `runGitMutation`) and type definitions can be imported by tests without instantiating the full React hook. This is the only file in the directory with no React imports.
`─────────────────────────────────────────────────`

Updated the CLAUDE.md with the following corrections and additions over the previous version:

- Fixed IPC channel name: `git.statusDetailed` (not `git.status`), and added `git.branch` (distinct from `git.branches`)
- Added the full IPC channel table including `git.diffCached`, `git.log`, and `ai.generateCommitMessage` used by AI commit generation
- Added `useGitCommitGeneration.ts` to the key files table (it was entirely missing)
- Added `GitPanelContentParts.tsx` to the key files table
- Documented the initialization flow with the `cancelled` flag race-condition guard
- Added `GitPanelState` to the core types section
- Clarified the `R` status code's missing design token (uses hardcoded `#58a6ff` fallback)
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# GitPanel — Git staging, committing, and branch switching UI

## Key Files

| File                         | Role                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitPanel.tsx`               | Entry point — connects `ProjectContext` to the model hook, spreads model as props into content                                                                        |
| `GitPanelContent.tsx`        | Pure presentational component — renders staged/unstaged file lists, commit form, error banner. All state received via props.                                          |
| `GitPanelContentParts.tsx`   | Sub-components for the commit area: `CommitMessageInput`, `CommitButton`, `ReviewChangesBar`, `CommitSection`. Split from content to stay under file line limits.     |
| `useGitPanelModel.ts`        | State + logic hook — owns all git operations (stage, unstage, commit, checkout, discard) via `window.electronAPI.git.*` IPC calls. Exports `GitPanelModel` interface. |
| `useGitPanelModel.shared.ts` | Shared types and pure utility functions — extracted for testability. `runGitMutation` is the standard wrapper for all mutating git ops.                               |
| `useGitCommitGeneration.ts`  | AI-powered commit message generation — calls `git.diffCached` + `git.log`, sends diff to `ai.generateCommitMessage` IPC.                                             |
| `GitFileRow.tsx`             | Single file row — status badge (color-coded M/A/D/R/?), path display (dir + filename split), stage/unstage and discard buttons with two-click confirmation.          |
| `BranchSelector.tsx`         | Branch dropdown — click-outside dismissal via internal `useDropdownDismiss` hook.                                                                                     |
| `index.ts`                   | Barrel — exports `GitPanel`, `GitFileRow`, `BranchSelector`                                                                                                           |

## Architecture

**Strict model/view separation**: `GitPanel.tsx` is a thin connector — pulls `projectRoot` from `ProjectContext`, instantiates `useGitPanelModel(projectRoot)`, and spreads the entire model into `GitPanelContent`. The content component has zero IPC awareness.

**Git operations pattern**: Every mutation goes through `runGitMutation` (from `.shared.ts`), which guards against null `projectRoot`, executes the operation, then calls `refreshStatus()`. Never call `refreshStatus()` manually after a mutation — `runGitMutation` does it.

**Initialization flow**: On mount (or `projectRoot` change), `useGitInitialization` first calls `git.isRepo` to check if the path is a git repo. If yes, it runs `refreshStatus` + `refreshBranches` in parallel. If no, it calls `resetRepoState`. The effect uses a `cancelled` flag to discard stale async results on rapid `projectRoot` changes.

## Core Types (from `.shared.ts`)

- **`GitStatusMap`** = `Record<string, string>` — keys are file paths, values are status codes (M, A, D, R, ?)
- **`GitFileEntry`** = `[string, string]` tuple — `[filePath, statusCode]`, sorted alphabetically via `sortEntries()`
- **`GitPanelModel`** — flat interface of data + callbacks; the full contract between hook and view
- **`GitPanelState`** — raw state bundle (useState values + setters) passed between internal sub-hooks

## Conventions

- **Two-click discard**: `GitFileRow` requires a confirmation click before discarding — tracks confirm state internally with auto-reset timeout
- **Status badge colors**: M=warning/yellow, A=success/green, D=error/red, R=info/blue, ?=muted — via CSS `var(--status-*)` custom properties with inline fallbacks
- **Commit shortcut**: `Ctrl+Enter` in the commit textarea triggers commit via `handleKeyDown` in the model
- **AI commit generation**: Fetches staged diff (`git.diffCached`) and last 5 commit messages (`git.log`) before calling `ai.generateCommitMessage`. Requires staged files — guard is `stagedCount === 0`

## IPC Channels Used

| Channel                  | When called                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `git.isRepo`             | On mount / `projectRoot` change                                |
| `git.statusDetailed`     | On mount and after every mutation (via `refreshStatus`)        |
| `git.branch`             | Alongside `statusDetailed` to get current branch name         |
| `git.branches`           | On mount and after checkout (to populate branch list)          |
| `git.stage` / `unstage`  | Per-file stage/unstage buttons                                 |
| `git.stageAll` / `unstageAll` | Section-level buttons                                    |
| `git.discardFile`        | Discard button (after confirmation)                            |
| `git.commit`             | Commit button / Ctrl+Enter                                     |
| `git.checkout`           | Branch selector                                                |
| `git.diffCached`         | AI commit message generation — fetches staged diff             |
| `git.log`                | AI commit message generation — fetches recent commit messages  |
| `ai.generateCommitMessage` | AI commit message generation — sends diff + context        |

IPC types: `src/renderer/types/electron-git.d.ts`

## Dependencies

- **Upstream**: `ProjectContext` (`src/renderer/contexts/`) for `projectRoot`
- **Downstream**: nothing — this component owns its own state entirely

## Gotchas

- `isRepo` starts as `null` (unknown) until the first check resolves — render a neutral empty state, not an error, during this window
- `git.statusDetailed` (not `git.status`) is the IPC channel — it returns separate `staged`/`unstaged` maps, not a flat list
- Branch list is **local branches only** — no remote tracking branches
- `refreshStatus` fires on mount and after every mutation — duplicate renders are expected and harmless
- Status badge colors use `var(--status-*)` CSS custom properties with hardcoded fallbacks (`#58a6ff` for rename) — the `R` status code does not yet have a design token
