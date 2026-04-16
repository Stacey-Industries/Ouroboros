# Wave 23 — Side Chats & Branching
## Implementation Plan

**Version target:** v1.6.1 (patch)
**Feature flag:** `chat.sideChats` + `chat.branchingPolish` (both default `true`)
**Dependencies:** Wave 20

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Schema — `branchName`, `forkOfMessageId`, `forkOfThreadId` on threads; `forkThread` store method; IPC | `threadStoreSqlite*`, `threadStoreFork.ts` (new), `agentChat` IPC |
| B | BranchIndicator + BranchTreeView (visual branch surfaces) | `BranchIndicator.tsx`, `BranchTreeView.tsx` |
| C | SideChatDrawer + useSideChat hook + `Ctrl+;` shortcut | `SideChatDrawer.tsx`, `useSideChat.ts`, appEventNames |
| D | Merge-to-main action (appends system summary) | Merge helper + "Merge into main" action in drawer |
| E | Branch comparison side-by-side + auto-branch on edit | `BranchCompareView.tsx`, `editAndResend` → always branch |

## Feature flag

`chat.sideChats` (default `true`) gates the drawer + shortcut.
`chat.branchingPolish` (default `true`) gates the indicator + tree view + compare.

## Risks

- Context overhead in side chats → default minimal: parent's pinned + system prompt only; explicit opt-in for recent messages
- Accidental main pollution → Merge is explicit button, never implicit
- Tree clutter with > 20 branches → collapse; allow archiving

## Acceptance (wave total)

- `Ctrl+;` opens a side chat; main thread unchanged on close
- "Merge into main" appends a single system message to main
- Multiple side chats navigable via drawer tab bar
- Named branches persist; rename updates references
- Tree view renders threads with > 5 branches clearly
- Branch comparison shows side-by-side diff
- Edit-and-resend always branches
