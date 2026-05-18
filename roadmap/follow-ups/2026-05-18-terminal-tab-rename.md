---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 wave-wrap smoke
---

# Terminal tab rename affordance

Surfaced during Wave 94 wave-wrap smoke (Cole, 2026-05-18). With dock-slot
tabs (Phase C) and inner-rail sessions (Phase D) now first-class, users
need a way to rename tabs — the auto-generated titles (`Terminal {n}`
from `useTerminalSessions`, or PTY `titleChange` event values) aren't
always meaningful.

## Scope

- Dock-slot `DockSlotTabs` — double-click to edit title, or right-click
  context menu "Rename" item.
- Inner-rail `InnerSidebarTerminals` rows — similar pattern.
- Per-project persistence: rename must survive (a) tab close/reopen via
  restore, (b) project switch + return. Stored on `SessionTabRef.title`
  in `projectTerminalsSchema.ts`'s per-project state (the field already
  exists; this just needs a setter wired through).
- Title sync with PTY `titleChange`: a user rename should "stick" and
  no longer be overwritten by subsequent PTY `titleChange` events
  (otherwise the rename gets clobbered the next time the shell prompt
  fires an OSC 0/1/2 sequence). Track a `userRenamed: boolean` on
  `SessionTabRef`.

## Why not Wave 94

Wave 94's scope was the five wave-89-pivot contract gaps. Tab rename is
net-new UX. Adding it mid-wave-wrap drags the wave out. Defer to its own
small follow-up wave (or fold into a polish wave with other tab
quality-of-life items).

## Hooks for the implementer

- `useProjectTerminals.ts` SlotHandle interface — add `renameSession(id, title)`.
- `buildSlotHandle` — wrap a new method that patches `projectState[slotKey]`'s
  matching `SessionTabRef.title` AND sets `userRenamed: true`.
- `projectTerminalsSchema.ts` — add `userRenamed: z.boolean().default(false)` to
  `SessionTabRefSchema`.
- `useTerminalSessions.sync.ts` — when a `titleChange` PTY event fires for
  a session whose ref has `userRenamed: true`, skip the rename. (May
  require lifting the per-project state into the title-change handler's
  scope, or adding a callback registry.)
- `DockSlotTabs.tsx` — inline edit on double-click. Submit on Enter,
  cancel on Escape.
- `InnerSidebarTerminals.tsx` — context-menu "Rename" item invoking the
  same edit affordance.

Estimate: 1 small wave (~4–6 files, ~4 hours).
