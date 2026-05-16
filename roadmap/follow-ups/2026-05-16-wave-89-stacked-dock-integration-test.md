---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
---

# Wave 89 Phase 1 — stacked-dock divider-drag integration test deferred

## Context

Wave 89 Phase 1 (commit `861343b4`) added unit-test coverage for the slot-height math in `useDockSlotHeights.test.ts` (10 cases including legacy migration). The plan called for an integration test at `src/renderer/components/Layout/ChatOnlyShell/__tests__/ChatWorkbenchTerminalDock.stacked.test.tsx` covering:

- Mount the dock with two slots; spawn a session in each; assert each has a distinct session ID.
- Drag the divider via simulated pointer events; assert both slot heights updated; assert sum is constant.
- Persistence round-trip: write slot heights, re-mount, assert restored values.
- Legacy migration: provide a fixture with legacy `dockHeight` only; mount; assert seeded heights match the 60/40 split.

The implementing subagent deferred this; the unit tests in `useDockSlotHeights.test.ts` cover the persistence/clamp logic, but the component-level drag path is untested.

## What to do

Author `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchTerminalDock.stacked.test.tsx` with the four cases above. Use `@testing-library/react` + simulated pointer events (`fireEvent.pointerDown` → `pointerMove` → `pointerUp` on the divider handle). Mock the persistence layer or use the real `migrateDockPersistence` with a fixture.

Reference: `OverlayDrawer.test.tsx` (commit `2412b029`) uses the same pointer-event simulation pattern for its width handle.

## Why this is OPEN not BLOCKING

Math is unit-tested. Wiring is integration-tested at the unit-render level (`DockSlot.test.tsx` mounts two instances and verifies independent state). The drag pointer-flow integration gap is real but small; adding it post-ship is low-friction.

## Promotion criteria

Add to a Wave 89.x follow-up commit OR fold into the next renderer-test sweep wave. Close as RESOLVED when the test file exists and passes.
