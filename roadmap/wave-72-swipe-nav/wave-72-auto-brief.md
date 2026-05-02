# Wave 72 — Result Brief

**Title:** Mount swipe navigation on AgentChatWorkspace root
**Status:** Shipped
**Dates:** 2026-05-02 (single session)
**Branch:** `master`

## What shipped

Swiping left or right on the `AgentChatWorkspace` panel now cycles through the thread list (wrap-around). The Wave 32 Phase I deferral — "AgentChatWorkspace has no stable root ref in its slot API" — is closed.

### The gap

`useSwipeNavigation` (Wave 32 Phase I) was built and fully functional but never mounted. The tab bar TODO at `AgentChatTabBar.tsx:101-103` documented the blocker verbatim. The workspace root div had no `ref` attached and no mechanism to expose one to a caller.

### The fix

Three files changed:

**`AgentChatWorkspace.swipe.ts`** (new)
- `cycleThread(threads, activeThreadId, direction)` — pure wrap-around cycling helper. Given `threads[]` and the active thread ID, returns the ID of the adjacent thread. Wraps at both ends. Returns `null` when fewer than 2 threads.

**`AgentChatWorkspace.tsx`**
- Added `useSwipeNavigation` and `cycleThread` imports.
- Added `useWorkspaceSwipe(ref, model)` helper hook — mounts `useSwipeNavigation` with stable `useCallback` handlers that call `cycleThread` + `model.selectThread`.
- `AgentChatWorkspace` component: added `workspaceRef = useRef<HTMLDivElement>(null)`, calls `useWorkspaceSwipe(workspaceRef, setup.model)`, attaches `ref={workspaceRef}` to the root div.

**`AgentChatTabBar.tsx`**
- Replaced the three-line TODO comment (deferral note + roadmap file reference) with a two-line comment acknowledging the opt-out purpose and noting the Wave 72 resolution.

### Wiring path

Swipe gesture on workspace panel → `useSwipeNavigation` fires `onSwipeLeft`/`onSwipeRight` → `useWorkspaceSwipe` callback → `cycleThread(threads, activeThreadId, 'left'/'right')` → `model.selectThread(nextId)` → zustand store updates `activeThreadId` → `AgentChatConversation` re-renders with the adjacent thread's messages.

The tab bar's `data-no-swipe` attribute continues to block swipes originating in the tab strip (scrollWidth guard + explicit opt-out, belt-and-suspenders).

## Tests

- **New** `AgentChatWorkspace.swipe.test.ts`: 6 `cycleThread` unit tests — null guard (<2 threads), left advances, left wraps, right retreats, right wraps, fallback to index 0 when activeThreadId not found.
- **Pre-existing** `AgentChatWorkspace.test.tsx`: 6 side-chat wiring tests — all pass.
- **Lint:** clean (`npx eslint` — 0 errors).
- **Typecheck:** clean (`tsc --noEmit`).

## Manual smoke gate

Not in `src/renderer/components/Layout/**` — manual smoke gate rule does not strictly apply. Per lead directive: **user smoke deferred per lead directive**.

Smoke items if the lead wants to verify:
- [ ] Open workspace with 2+ threads. Swipe left → conversation switches to next thread.
- [ ] Swipe right → conversation switches to previous thread.
- [ ] Swipe past last thread → wraps to first.
- [ ] Swipe in the tab bar → no thread switch (data-no-swipe still blocks).
- [ ] Single thread workspace → swipe does nothing.

## Observation point (Phase A)

Observation point: "the conversation panel switches to the adjacent thread when the user swipes left or right."

Direct runtime observation was not possible (no live IDE session in this worktree context). The `cycleThread` logic is fully covered by unit tests; the wiring path from ref → hook → callback → selectThread is structurally correct and type-safe. The unit tests confirm the cycling behavior. The observation point cannot be verified beyond tests in this context — stated explicitly per the implementer note requirement.

## ADR

`roadmap/wave-72-swipe-nav/wave-72-decisions.md` — three decisions: (1) internal ref not forwardRef, (2) wrap-around cycling, (3) hook wired from workspace internals with no new props or store fields.

## Files changed

```
roadmap/wave-72-swipe-nav/waveplan-72.md                          (new — wave plan)
roadmap/wave-72-swipe-nav/wave-72-decisions.md                    (new — ADR)
roadmap/wave-72-swipe-nav/wave-72-auto-brief.md                   (this brief)
src/renderer/components/AgentChat/AgentChatWorkspace.swipe.ts     (new — cycleThread)
src/renderer/components/AgentChat/AgentChatWorkspace.swipe.test.ts (new — 6 tests)
src/renderer/components/AgentChat/AgentChatWorkspace.tsx          (ref + hook wired)
src/renderer/components/AgentChat/AgentChatTabBar.tsx             (TODO removed)
```
