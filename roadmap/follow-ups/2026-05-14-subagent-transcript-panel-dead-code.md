---
status: OPEN
created: 2026-05-14
updated: 2026-05-14
---

# `SubagentTranscriptPanel` is defined but never mounted in production

## Symptom

`src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx` defines and exports `SubagentTranscriptPanel` (with `data-testid="workbench-subagent-panel"`), but no production file imports or renders it. Grep for `SubagentTranscriptPanel` / `workbench-subagent-panel` across `src/renderer/**/*.{ts,tsx}` excluding test files returns only the defining file itself.

## How it surfaced

2026-05-14, during the hot-patch of 4 pre-existing CI failures. The `ChatWorkbenchShell` integration test asserted `getByTestId('workbench-subagent-panel')` after firing `OPEN_SUBAGENT_PANEL_EVENT` — an assertion that could never pass against current production code, because the panel is never mounted. The hot-patch dropped that assertion to make the test reflect reality; this follow-up captures the underlying dead-code finding.

## Context

The ChatOnlyShell `CLAUDE.md` lists `SubagentTranscriptPanel` in the Wave 46 / Wave 47 Phase C composition tree ("subagent transcript drill-in"). At some point between then and now the component was unmounted — `OPEN_SUBAGENT_PANEL_EVENT` now routes to the `monitor` tab via `useWorkbenchSurfacePolicy` (`openUtility({ tab: 'monitor' })`), not to a dedicated subagent panel. The component, its 3 `workbench-subagent-panel` testids, and any supporting hooks were left behind.

## What to decide

Either:
1. **Re-mount it** — if subagent-transcript drill-in is still wanted as a distinct surface (separate from the monitor tab), wire it back into `ChatWorkbenchUtilityDrawer` / the surface policy.
2. **Delete it** — if the `monitor` tab fully subsumed the use case, remove `SubagentTranscriptPanel.tsx` + any now-orphaned supporting code (`useWorkbenchTimeline` / subagent-transcript helpers — audit what else only it consumed), and update the ChatOnlyShell `CLAUDE.md` composition tree to drop the stale entry.

Option 2 is the likely call — the `monitor` tab routing suggests a deliberate consolidation — but confirm with whoever did the Wave 47→later refactor before deleting.

## Scope

Small. One component file + a CLAUDE.md correction, plus a quick orphan-audit of anything that only `SubagentTranscriptPanel` imported. Not urgent — it's inert dead code, not a bug.
