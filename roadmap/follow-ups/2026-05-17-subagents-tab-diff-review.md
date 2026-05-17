---
status: OPEN
created: 2026-05-17
updated: 2026-05-17
type: review-needed
parent-initiative: Wave M-6 meta-sweep
---

# Cole — review subagents-tab feature diff before next push

## Context

During the 2026-05-13 failing-test fix session, a sonnet-diagnostician completed wiring an unimplemented 'subagents' tab feature. This involved 4 production files + 3 test files: `useChatWorkbenchLayout.ts`, `useWorkbenchSurfacePolicy.ts`, `ChatWorkbenchUtilityDrawer.tsx`, plus test assertion corrections. All 916 tests pass.

The wiring was complete and correct per the diagnostician's report, but it shipped without Cole reviewing whether the feature is INTENDED to be active in production yet.

## Proposed action

Before the next push to the branch carrying these changes:

1. `git diff` against the prior state on the four production files + three test files.
2. Confirm shipping intent — if the feature was supposed to be ready, the wiring is correct.
3. If NOT ready, revert via git OR add a feature flag to gate visibility.

## Cross-reference

Tracked at meta-framework level: surfaced in M-6 sweep (`meta/CHANGELOG.md` history section). Project owns the action.

## Related

- Files: `src/renderer/.../useChatWorkbenchLayout.ts`, `useWorkbenchSurfacePolicy.ts`, `ChatWorkbenchUtilityDrawer.tsx`
- Wave context: ChatWorkbenchFollowThrough.integration.test.tsx OPEN_SUBAGENT_PANEL_EVENT (fixed test)
