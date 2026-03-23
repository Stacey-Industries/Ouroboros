# TimeTravel — Git snapshot browser with compare and restore

## Key Files

| File                         | Role                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TimeTravelPanel.tsx`        | Root component — composes Controls, Timeline, and Details panes. Receives snapshots + callbacks from parent.                                                 |
| `useTimeTravelPanelState.ts` | All panel state — composed from 5 internal hooks (`useCurrentHead`, `useSnapshotSelection`, `useChangedFiles`, `useRestoreState`, `useCreateSnapshotState`). |
| `TimeTravelTimeline.tsx`     | Vertical snapshot timeline — colored dots (session-start=blue, session-end=green, manual=muted). Shows HEAD/FROM/TO badges.                                  |
| `TimeTravelDetails.tsx`      | Right pane — snapshot metadata, changed file list with diff stats, restore button. Exports `RestoreConfirmDialog`.                                           |
| `TimeTravelControls.tsx`     | Header + toolbar — compare mode toggle, manual snapshot creation (label input), refresh, status messages.                                                    |
| `timeTravelUtils.ts`         | Pure functions — timestamp formatting, snapshot type labels/colors, file status icons/colors, `getNextSelectionState` state machine.                         |
| `index.ts`                   | Barrel — exports `TimeTravelPanel` + `TimeTravelPanelProps`.                                                                                                 |

## Architecture

`useTimeTravelPanelState` owns all state; the three visual components are pure renderers. Each visual component receives a typed slice (`ControlsPanelState`, `TimelinePanelState`, `DetailsPanelState`) — zero internal state in the UI layer. Sorting (newest-first) happens once in the hook, not in children.

## IPC Dependencies

All git operations via `window.electronAPI.git`:

| Call                                      | Purpose                                       |
| ----------------------------------------- | --------------------------------------------- |
| `git.snapshot(projectRoot)`               | Get current HEAD hash                         |
| `git.changedFilesBetween(root, from, to)` | Diff file list between two commits            |
| `git.dirtyCount(projectRoot)`             | Count uncommitted changes (for restore guard) |
| `git.restoreSnapshot(root, commitHash)`   | Checkout a snapshot commit                    |

`WorkspaceSnapshot` type: `../../types/electron`.

## Compare Mode State Machine

`getNextSelectionState` in `timeTravelUtils.ts` drives two-click selection:

1. First click → sets FROM (yellow badge)
2. Second click (different snapshot) → sets TO (purple badge), comparison becomes ready
3. Third click → resets to new FROM, clears TO

Toggling compare mode clears both FROM and TO.

## Gotchas

- **Inline styles throughout** — no Tailwind. Uses CSS vars (`var(--bg)`, `var(--text)`, `var(--accent)`, `var(--border)`, `var(--font-ui)`, `var(--font-mono)`) for theme compat.
- **Restore is two-step** — "Restore" checks dirty count first; `git.restoreSnapshot` only fires on confirm. Backend stashes dirty changes automatically before checkout.
- **Status messages auto-dismiss** after 5 seconds via `useStatusMessage` internal hook.
- **`cancelled` flag pattern** — all async `useEffect` calls use a boolean `cancelled` flag to discard stale results from rapid snapshot clicks. Follow this pattern for any new async fetches here.
- **`useChangedFiles` deps include the full `args` object** — if you add fields to `ChangedFilesArgs`, ensure the enclosing memo/callback is stable or the effect will re-fire on every render.
