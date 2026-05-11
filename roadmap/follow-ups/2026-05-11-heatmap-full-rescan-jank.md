---
status: OPEN
created: 2026-05-11
updated: 2026-05-11
---

# Heat-map full-rescan causes visible jank during bursty parallel edits

## Symptom

After Wave 84 Phase B enabled the heat-map by default (commit `a2f09251`), Cole observed that during parallel agent edits (e.g., "edit 10 files in parallel"), the file-tree heat-map borders **fade in and out repeatedly** instead of rendering smoothly. The IDE feels like it's "refreshing rapidly."

## Cause (flagged in advance by the Phase B instrumentation agent)

From the Phase B agent's report:

> `useFileHeatMap` reads from `useAgentEventsContext().currentSessions` — a React context that holds the reducer state. The heat-map hook re-runs its `useEffect` whenever `currentSessions` changes (React re-render), at which point `collectRawHeatData` iterates all sessions and all tool calls in each session. **This is a full-rescan pattern, not an incremental subscription** — every tool call in every session is logged on every sync, not just new ones.

With ~100 stored sessions and many tool calls per session, every state update from a `TOOL_END` event triggers:
1. React re-render of the heat-map hook
2. Full O(sessions × tool_calls) scan
3. Map rebuild
4. All visible file-tree rows re-render with new `getHeatLevel` results
5. CSS class application

Under 10-files-in-parallel agent edits, this fires 10 times in rapid succession. The transitions don't have time to complete, hence the fade-in-fade-out effect.

## Recommended fix shape

Two paths, not mutually exclusive:

1. **Incremental scan**: track which tool calls have been processed (the `processedCallIdsRef` early-exit at `useFileHeatMap.ts:207` is already there but the agent flagged uncertainty about whether it's preventing re-runs correctly). Verify the early-exit fires when no new tool calls arrived, and improve it if not.

2. **Memoize aggressively**: derive heat map only when `currentSessions` actually has new tool-call IDs vs the last run. Use `useMemo` with a stable hash of "all tool call IDs across sessions" — re-run only when that hash changes.

3. **Throttle re-renders**: rAF batching on the heat-map's setState calls, similar to `useRafBatchedChunks` for streaming. Trade tightness of "instant" for smoothness.

## Related

- See `2026-05-11-chat-state-architecture-overhaul.md` — heat-map's full-rescan pattern is a symptom of the broader state-management leakage (storing 100 sessions in renderer memory, scanning all on every update). A coordinated fix during the overhaul is probably cleaner than a targeted patch now.
- The ~100-session-store-growth issue is its own follow-up component.

## Severity

Low-medium. Heat-map is informational; the jank is annoying but doesn't break functionality. Lower priority than the broader chat-state overhaul.
