# Agent chat swipe navigation — mount `useSwipeNavigation` on workspace

**Status:** WAVE-IT — single phase, low priority (deprioritize until Capacitor mobile is closer to user-facing)
**Source:** `roadmap/audit-verification-pass.md` Section D, item #8a (Wave 32 Phase I follow-up)
**Filed:** 2026-05-01

## Summary

A `useSwipeNavigation` hook detects horizontal swipe gestures (touch + trackpad) and fires `onSwipeLeft` / `onSwipeRight`. Wave 32 Phase I built it intending to let users swipe between chat threads. The hook exists and works. It's never mounted because the intended mount point — `AgentChatWorkspace` root — has no stable DOM ref exposed through its slot API.

This is a refactor blocker, not a feature gap.

## What's wrong

`AgentChatTabBar.tsx:103-107` says exactly:

> *TODO(Wave 32 Phase I — session cycling): mount useSwipeNavigation on the AgentChatWorkspace root (or RightSidebar container) with onSwipeLeft/onSwipeRight cycling onSelectThread across threads[]. The tab bar is too narrow for reliable axis disambiguation — the full workspace panel is the right mount point. **Deferred: AgentChatWorkspace has no stable root ref in its slot API.***

The tab bar already has `data-no-swipe` to opt out of the gesture handler — that scaffolding is already there. The mount target is the missing piece.

## Cost to fix

Two pieces:

1. **Expose a stable ref on `AgentChatWorkspace`.** Either:
   - `forwardRef` on the workspace component
   - A `<div ref={workspaceRef}>` wrapper inside that doesn't break the existing slot API
   The choice depends on which is less invasive to the slot composition pattern. Inspect `AgentChatWorkspace.tsx` for current shape.

2. **Mount the hook.** `useSwipeNavigation({ onSwipeLeft: cycleToPreviousThread, onSwipeRight: cycleToNextThread })` attached to that ref. Wire callbacks against `threads[]` array — wrap-around or clamp at edges (decide on intuition from product side).

Plus a smoke test that confirms a synthetic swipe event triggers `onSelectThread` with the right thread ID.

## Why this matters (and why low priority right now)

- Desktop users mostly click. Polish, not critical.
- **Becomes table stakes the moment Capacitor mobile reaches users.** Swipe between chat threads is an unstated expectation on touch surfaces.
- Capacitor wiring for Android is partially live (per `feedback_chat_agent_parity.md` and the active `capacitor.config.ts`). Mobile UX without swipe nav would feel broken from minute one.

So: file it for "before Capacitor mobile reaches end users." If mobile is on the near horizon (months), it should land before the mobile beta. If years out, it can wait.

## Related deferred items (in case they're bundled later)

The audit verification doc grouped this with `agentMonitor.subagentDisplay.enabled` flag flip — that flip happened separately (subagents nest under parent via `parentSessionId` already wired in `AgentTree.tsx`, so the flag was safe to flip directly).

A natural future bundle would be a "mobile readiness" wave: this swipe nav + any other touch-target sizing or gesture handling gaps revealed when running the Capacitor build on a real device.

## References

- `src/renderer/components/AgentChat/AgentChatTabBar.tsx:103-107` — TODO with full integration spec
- `src/renderer/hooks/useSwipeNavigation.ts` — the hook itself (Wave 32 Phase I)
- `src/renderer/components/AgentChat/AgentChatWorkspace.tsx` — refactor target
- `data-no-swipe` opt-out — already on the tab bar (line 112)
- Audit: `roadmap/audit-verification-pass.md` Section D item #8a
- Wave 32 Phase I plan
