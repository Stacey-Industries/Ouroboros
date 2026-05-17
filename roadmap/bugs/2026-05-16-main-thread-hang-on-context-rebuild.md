---
status: RESOLVED
created: 2026-05-16
updated: 2026-05-17
severity: high
---

# Main-thread hang up to ~2.5 minutes during context-cache / graph-summary cycle

## Observed signature

From Cole's dev session (2026-05-16, post-Wave-89-Phase-4b but **confirmed pre-Wave-89**):

```
22:35:53.407 > Context cache built via worker in 493771 ms for key: C:\Web App\Agent IDE
22:35:53.519 > [trace:buildGraphSummary] start
22:35:54.024 > [jank] event loop blocked for ~465ms — total janks this session: 7
22:35:54.025 > [jank] heap: used=91.3MB total=136.1MB limit=4096.0MB external=25.4MB
22:35:54.025 > [jank] active handles=21 (Socket:9, MessagePort:5, FSWatcher:3, Server:3, ChildProcess:1)
22:35:54.101 > [trace:buildGraphSummary] done in 582ms hotspots=20 blast=0
22:38:26.389 > [jank] event loop blocked for ~152165ms — total janks this session: 8
22:38:26.401 > [claude-usage-poller] spawning: powershell.exe [ '-NoLogo', '-Command', '& claude' ]
22:38:27.199 > [jank] active handles=223 (Socket:161, ChildProcess:50, MessagePort:6, FSWatcher:3, Server:3)
```

Symptom from outside: UI completely unresponsive. Appears as a crash. Process never dies — recovers after the block.

## Concrete observations

- **152 seconds main-thread block** between `buildGraphSummary done` (22:35:54.101) and the next jank report (22:38:26.389)
- During the block: no main-process log activity (anything that needed to log was waiting)
- **Active handles spike to 223** immediately after recovery (161 Sockets + 50 ChildProcesses) — likely `claude-usage-poller` spawn (powershell + claude REPL) on a stale interval timer that fired multiple times during the freeze and all queued up
- Heap healthy throughout (max ~185MB / 4GB limit) — not an OOM
- 8-minute background "Context cache built via worker" completed cleanly just before; the freeze starts after that result hand-off to main thread
- Recovery is automatic; subsequent operations normal

## Hypotheses (need diagnostician to verify)

1. **Worker result hand-off** — the 8-minute worker product is a large object structure. Deserializing or processing it on the main thread blocks for 152s.
2. **Synchronous fan-out** — `buildGraphSummary` or a downstream consumer (`context-layer forceRebuild`, `context-ranker shadow`) runs a synchronous tight loop over all graph nodes (~23.4K nodes in this repo).
3. **Native module call** — `better-sqlite3` write or `tree-sitter` reparse on main thread can block for tens of seconds at scale.
4. **Background poller cascade** — `claude-usage-poller` spawns powershell+claude every N seconds; if multiple invocations queue up during a non-related block, their resolution can compound the hang.

## Diagnostic plan

Dispatch `sonnet-diagnostician` (background task) with:

- Instrument `buildGraphSummary` → all downstream callees with high-resolution timestamps
- Add instrumentation around `Context cache built via worker` → main-thread receipt → first downstream action
- Capture handle-count, active-async-resources, and stack at the moment of next jank
- Search for any `for (...)` over `graph.nodes`, `graph.edges`, or `forEachSync`-style traversal called on the main thread post-rebuild
- Cross-check `claude-usage-poller` for interval bookkeeping (does it dedupe in-flight polls?)

## Diagnostician findings (2026-05-16)

**Root cause hypothesis (top-1):** `triggerContextLayerRebuildAfterGraphReady` → `forceRebuild` → `generateRepoMap` runs ~200 synchronous SQLite Cypher queries on the main thread with NO yield points — across three phases:
- `enrichSummariesWithGraphSignatures` (~50 calls)
- `buildCrossModuleDependenciesFromGraph` (~100 calls, 2 per module)
- `computeAllModuleHotspotScores` (~50 calls)

Each `queryGraph(cypher)` is synchronous against the fully-populated ~23.4K-node graph. At ~0.75s avg, 200 × 0.75s ≈ 150s — matches the 152s observation.

**Co-present block (top-2):** `computeHotspots` inside `buildGraphSummary` runs a synchronous `.map()` calling `db.getNodeDegree` per node (~7K Function/Method nodes). Produced the 465ms jank #7. Independent from the 152s jank #8, but illustrates the same pattern.

**Doubled log lines:** independent from the hang. Likely two jank events firing in quick succession during recovery drain. No shared root cause.

**Wave 89 implication:** none. Phase 1's dual-`useTerminalSessions` operates entirely in the renderer; no path to the main-thread SQLite fan-out.

## Instrumentation landed (partial — 3 of 5 files)

Diagnostician's instrumentation merged into commit `6b52c908` (Phase 4c commit 2's sweep):

| File | What it captures |
|------|------------------|
| `src/main/ipc-handlers/agentChatContext.ts` (`attachGraphSummary`) | Start ts, snapshot file count, packet presence, heap at handoff; `buildGraphSummary` resolution time; total settle time |
| `src/main/mainStartupContextLayerTrigger.ts` (`triggerContextLayerRebuildAfterGraphReady`) | Triggered ts + heap, total elapsed for `forceRebuild` |
| `src/main/contextLayer/repoMapGeneratorRanking.ts` (`computeAllModuleHotspotScores`) | Start/done with module count and total ms; per-module slow-query warning (>500ms) |

**Deferred** (lost to ESLint max-lines:300 cap; needs helper extraction before re-instrumenting):
- `src/main/contextLayer/repoMapGenerator.ts` — per-phase timing inside `buildRepoMapPhases` (detectModules / structuralSummaries / crossModuleDeps / enrichSummaries / hotspotScores). **This is the highest-value lost instrumentation** — it would prove which of the 3 fan-out phases dominates.
- `src/main/codebaseGraph/queryEngine.ts` — `computeHotspots` node-fetch timing. Lower priority (hypothesis 2, not hypothesis 1).

## Reproduction steps for Cole

1. Start the app fresh (cold graph cache — delete `userData/codebase-memory.sqlite` if needed to force a full graph index).
2. Open the Agent IDE project as the workspace.
3. Wait for the graph index to complete (watch for `[system2] initial index complete` in logs).
4. Wait for the context worker to complete (watch for `Context cache built via worker`).
5. **Watch for `[trace:post-graph-forceRebuild] triggered`** — the freeze should start within seconds of that.
6. Capture the full main-process log from that line through the next `[jank] event loop blocked` entry.

**What to look for in the captured log:**
- The total `forceRebuild` elapsed time from `mainStartupContextLayerTrigger.ts`.
- `computeAllModuleHotspotScores` total ms — if dominant (>50s), hypothesis 2 confirmed. If small (<10s), the lost instrumentation on `buildRepoMapPhases` is needed to find the dominant phase among the other two.
- Any `slow-query` per-module warnings (>500ms) — these isolate which specific Cypher patterns are pathological.

## Next actions

Lane B fix wave should:
1. Re-add per-phase trace logging to `repoMapGenerator.ts` after extracting `buildRepoMapPhases` into helper functions (needed to bring the file under the 300-line cap).
2. From the captured log, identify the dominant phase.
3. Pick a fix from: (a) yield-between-queries via `await new Promise(setImmediate)` or microtask scheduling, (b) move the entire fan-out to a worker thread, (c) batch all Cypher queries into a single multi-statement query with proper SQLite indexing.
4. Cleanup investigation logs at B5 (the `[trace:...]` tags are greppable).

## Why this is a bug, not a follow-up

User-visible severity: 2.5 minutes of UI freeze masquerades as a crash. The user has assumed the app died and restarted; data may be lost. Doesn't gate Wave 89 ship (predates the wave) but should be a near-term Lane B fix wave.

## Resolution (B3a — 2026-05-17)

Diagnostician's top-1 hypothesis (synchronous SQLite fan-out) was **refuted** by the per-phase instrumentation re-added in this wave. The actual culprit was three accidental O(N²) loops in pure-JS module detection over the 46,302-file repoIndex snapshot:

| Detector | Before | After (algorithmic fix) |
|---|---:|---:|
| featureFolders | 7,024ms | 244ms |
| flatGroups | 27,959ms | 188ms |
| singleFiles | 51,293ms | 44ms |
| **detectModules total** | **86,690ms** | **1,059ms** (82× faster) |
| generateRepoMap total | 89,556ms | 4,892ms (18× faster) |

Root cause: each detector iterated the full unfiltered 46k file list per candidate. Fix: build a `Map<dir, files[]>` index once at the top of `detectModules`; reuse in `detectFeatureFolders.claimFeatureFolder`, `detectSingleFileModules.assignCompanionTestFile`, and `detectFlatGroups.assignFlatGroupFiles`. Additionally rewrote `findPrefixGroups` / `hasAnyPrefixGroup` to use sorted+adjacent LCP (O(N log N) instead of O(N²)).

Files touched: `repoMapGenerator.ts`, `repoMapGeneratorSizeCap.ts` (new), `moduleDetector.ts`, `moduleDetectorSingleFile.ts` (new), `moduleDetectorUtils.ts` + colocated tests.

Trace logging preserved as baseline observability: `[trace:generateRepoMap] phase=…` and `[trace:detectModules] phase=…` fire on every rebuild (~8 log lines total). This will surface any future regression in the same hotspot immediately.

## Residual + B3b follow-up

The 4.9s remaining `generateRepoMap` wall time is now distributed across pure-JS work (~1.7s) and synchronous Cypher queries against the codebase graph (~2.7s in `crossModuleDeps` + `hotspotScores` + `enrichSummaries`). User-perceived freeze dropped from 2.5 minutes to ~1-2 seconds.

B3b — wholesale move of `generateRepoMap` to a worker thread — tracked at `roadmap/follow-ups/2026-05-17-move-generateRepoMap-to-worker.md`.

## Promotion criteria (historical)

Lane B fix wave at next sweep — Wave 89.x or its own bug-wave. May naturally cluster with the related deferred items: e2e teardown hang (`roadmap/bugs/2026-05-15-e2e-teardown-hang.md`), the doubled-log-lines observation (which may share a root cause), and the `claude-usage-poller` cascade if it turns out to be its own contributor.
