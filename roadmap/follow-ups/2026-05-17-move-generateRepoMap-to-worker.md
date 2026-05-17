---
status: OPEN
created: 2026-05-17
updated: 2026-05-17
---

# Move `generateRepoMap` to a worker thread

## Origin

Lane B fix wave for `roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md`. The algorithmic fix in B3a dropped `detectModules` from 86.7s to 1.06s and overall `generateRepoMap` from 89.5s to 4.9s — but the remaining 4.9s still blocks the main thread, producing a 1-2 second user-perceived UI freeze on every context rebuild.

## What needs to happen

Move the whole `generateRepoMap` pipeline off the main thread so the UI stays responsive during context rebuilds.

Current main-thread budget after B3a (verified by trace lines, captured 2026-05-17 ~00:08 ET on a 46,302-file workspace, 23,418-node graph):

| Phase | ms | Nature |
|---|---:|---|
| detectModules | 1,059 | pure JS |
| structuralSummaries | 628 | pure JS, file walk |
| crossModuleDeps | 1,589 | synchronous Cypher queries |
| hotspotScores | 1,147 | synchronous Cypher per module (~50 queries) |
| enrichSummaries | 375 | Cypher queries |
| overhead/handoff | ~100 | — |
| **Total** | **~4,900** | all on main thread |

## Key questions for the architect

1. **Worker shape.** The codebase already has a "context worker" (visible in logs as `Context cache built via worker in Nms`). Does this worker have an exec/dispatch surface that `generateRepoMap` can be hosted on, or does it need its own dedicated worker?
2. **Graph access from off-main.** `crossModuleDeps`, `hotspotScores`, and `enrichSummaries` all call into `getGraphController().queryGraph(...)`. The graph controller lives in main process. Options:
   - Worker holds its own SQLite connection to the codebase graph and queries directly (avoids IPC round-trip but needs concurrent-read safety verification on the better-sqlite3 setup).
   - Worker marshals queries to main via IPC — but this defeats the purpose if main is still doing the queries synchronously.
   - Split: pure-JS phases run in worker; graph phases stay on main. Gives ~1.7s back to UI, not the full 4.9s.
3. **Result marshaling.** `RepoMap` is JSON-serializable. Cost of postMessage across the worker boundary at this payload size?
4. **Graph-readiness coordination.** `generateRepoMap` is triggered from `triggerContextLayerRebuildAfterGraphReady` (in `mainStartupContextLayerTrigger.ts`). The trigger fires after `[system2] initial index complete`. Worker needs to know the graph is ready before it starts.

## Constraints / boundaries

- DO NOT regress the algorithmic wins from B3a. `detectModules` must stay sub-second.
- KEEP the existing trace lines (`[trace:generateRepoMap]`, `[trace:detectModules]`) intact and visible from wherever the new code runs — they're load-bearing for catching future regressions.
- DO NOT touch the codebase-memory graph engine itself unless absolutely necessary; the cost/benefit doesn't favor it.

## Dispatch sequence (when this is picked up)

1. `sonnet-architect` — read-only plan. Investigates the existing context worker, decides graph-access strategy, returns blueprint with tradeoffs cited.
2. `sonnet-implementer` — executes the blueprint. Cross-file, judgment-required.
3. Verification: same repro as the B3a bug doc, expected outcome is `[trace:generateRepoMap] done` still ~5s totalMs but main thread stays unblocked the whole time (no `[jank] event loop blocked` line firing during the rebuild).

## Why this is a follow-up not a wave

Single concern (move one function to a worker), no other features piggybacking. Lane B B3b is the natural framing — close the residual that B3a couldn't fix at this layer.
