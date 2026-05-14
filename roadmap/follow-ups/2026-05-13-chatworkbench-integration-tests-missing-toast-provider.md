---
status: OPEN
created: 2026-05-13
updated: 2026-05-13
---

# Pre-existing: ChatWorkbench integration tests lack `<ToastProvider>` wrap

## Summary

Two integration tests fail with `useToastContext must be used inside <ToastProvider>` when the subagent-open event fires and `AgentMonitorManager` mounts. The error originates at `src/renderer/contexts/ToastContext.tsx:71` and propagates up through `AgentMonitorManager.tsx:125` → `:254`.

Affected tests:
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.integration.test.tsx` — "switches to the subagents tab when a subagent-open event fires"
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchFollowThrough.integration.test.tsx` — "opens the utility drawer on OPEN_SUBAGENT_PANEL_EVENT"

## Origin

**Not introduced by Wave 88.** `git diff master..wave-88-terminal-foundation` shows zero changes to either test file, `AgentMonitorManager.tsx`, `ToastContext.tsx`, or `ChatWorkbenchUtilityDrawer.tsx` (the path that mounts `AgentMonitorManager`). The integration test harnesses were authored in Wave 58/59 (last touched in commit `af211fad release: v2.8.1`) without a `<ToastProvider>` wrap. The failures appeared (or have been present) on master before Wave 88 branched.

## Fix shape

Wrap each integration test's render with `<ToastProvider>` (likely alongside the existing context providers in the test's render helper). Spot check:

```tsx
import { ToastProvider } from '@renderer/contexts/ToastContext';

// in render helper
<ToastProvider>
  <OtherExistingProviders>...</OtherExistingProviders>
</ToastProvider>
```

Or — if other integration tests already mount the full provider stack via a shared helper — extend that helper rather than per-test.

## Why not fix in Wave 88

- Out of scope (Wave 88 is terminal-foundation, not test infra).
- Wave 88's `/review` Check 5 covers boundary-phase acceptance tests; these aren't boundary-phase.
- Filing here so the next session that touches `AgentMonitorManager` / subagent-panel routing picks it up.

## Verification

```
npx vitest run src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.integration.test.tsx src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchFollowThrough.integration.test.tsx
```

After fix: both tests pass (currently 2/12 failing — 10 pass).
