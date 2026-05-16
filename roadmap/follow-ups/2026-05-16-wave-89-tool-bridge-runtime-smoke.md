---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
---

# Wave 89 Phase 1 — tool-bridge runtime smoke deferred

## Context

Wave 89 Phase 1 (commit `861343b4`) shipped the two-slot stacked terminal dock with the prop chain wired structurally:

```
DockSlot.onActiveSessionChange
  → ChatWorkbenchTerminalDock.useActiveSlotSession (primary ?? secondary)
  → onActiveSessionChange prop
  → ChatWorkbenchShell.setActiveDockSessionId
  → ChatOnlyTerminalToolBridge activeDockSessionId={activeDockSessionId}
```

The implementing subagent could not run `npm run dev` to confirm runtime behavior. Unit + integration tests cover the structural wiring; the runtime path is untested.

## What to do

1. `npm run dev`, open ChatOnlyShell, spawn a session in BOTH slots.
2. Focus the top (primary) slot. Ask the chat agent: "what's in the terminal?" Confirm `getTerminalOutput` returns the primary slot's content.
3. Focus the bottom (secondary) slot. Confirm next query returns secondary slot's content.
4. Close primary slot. Confirm queries return secondary slot's content (the `primary ?? secondary` fallback).
5. Close both slots. Confirm bridge returns no-active-session appropriately.

If routing fails at any step, the fix is in `ChatWorkbenchTerminalDock.useActiveSlotSession` or `ChatWorkbenchShell.setActiveDockSessionId` — neither requires re-architecture.

## Why this is OPEN not BLOCKING

Phase 4 includes the manual smoke gate per `~/.claude/rules-deferred/manual-smoke-gate.md`, which will surface this. Filing here so it's tracked discretely if the smoke gate catches it OR if Wave 90 hits it first.

## Promotion criteria

If Phase 4 smoke fails on this, promote to a Wave 89 in-scope fix (Phase 1 hotfix commit). If smoke passes, close as RESOLVED.
