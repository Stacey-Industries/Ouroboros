---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
---

# Wave 89 Phase 4b — dead `useWorkbenchCompare` hook call

## Context

Phase 4b removed `ChatWorkbenchComparePane` from the shell mount tree (it was a chat-side affordance — inspect a second thread side-by-side). The hook that produced the compare state — `useWorkbenchCompare` — is still called in `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchBody.model.ts` (per Phase 4b agent report), but its output is never consumed because the consumer (the compare pane) is gone.

Dead hook call: harmless at runtime (a few state subscriptions that produce nothing user-visible), but it's wasted work + a misleading signal for future readers.

## What to do

1. Read `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchBody.model.ts` to confirm the dead call.
2. Remove the `useWorkbenchCompare()` call and its returned state from the model + downstream prop chains.
3. If `useWorkbenchCompare` itself has no other callers, delete the hook file too (verify with grep first).
4. Update any tests that mock or assert on the compare state.

## Why this is OPEN not BLOCKING

Hook call is dead but harmless. Tests still pass. No user-visible impact.

## Promotion criteria

Fold into a cleanup wave or the same future wave that touches `ChatWorkbenchBody.model.ts` for other reasons. Close as RESOLVED when the call is removed and tests pass.
