# Wave 22 — Message Polish & UX Refinement
## Implementation Plan

**Version target:** v1.6.0 (minor)
**Feature flag:** `chat.messagePolish` (default `true`)
**Dependencies:** Wave 20

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Schema additions (reactions, collapsedByDefault) + IPC + FileRefResolver pure helper | `threadStoreSqliteHelpers.ts`, `threadStoreSqlite.ts`, `agentChatReactions.ts` (new), `FileRefResolver.ts` (new) |
| B | UI polish batch 1 — density toggle, raw markdown toggle, collapse expand/collapse controls, copy actions (markdown + plain) | `MessageCard/*`, density context |
| C | Reactions UI + message quoting (selection → composer blockquote) | `MessageCard/ReactionBar.tsx`, `ComposerQuoting.ts` |
| D | Clickable file references + inline citation hover cards | `FileRefBadge.tsx`, `CitationHoverCard.tsx` |
| E | Desktop notifications on stream completion (unfocused-only, DND-respect) | `notifications.ts` (new), `useStreamCompletionNotifications.ts` |
| F | Re-run from message (always branches) | `ReRunMessageAction.tsx`, thread-branch IPC |

## Feature flag

`chat.messagePolish` (default on) gates the new surfaces. Items that have their
own sub-flag:
- `chat.desktopNotifications` (default `true`)
- `chat.messageDensity` (value, default `'comfortable'` — not a boolean flag)

## Risks

- **Clickable file-ref false positives**: strict regex requires a path separator or `:line:col` form, and a leading word boundary.
- **Re-run from message** always forks — never destructive. Uses the existing `branchThread` primitive from the agentChat store.
- **Notifications on unfocused window**: use `BrowserWindow.isFocused()` guard + OS DND check (probed via `Notification.permission === 'granted'`; no cross-platform DND API, so we surface the setting and let the OS deliver).

## Acceptance criteria

- Each polish item works per its piebald description.
- Message render perf unchanged on 1000-message threads (spot-check via scroll test).
- Notifications fire only when window is unfocused.
- Re-run from message creates a branch with new metadata; original thread unchanged.
