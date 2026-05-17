# Session Handoff — 2026-05-17 (Lane B B3a + B3b SHIPPED locally, 9 commits ahead of origin/master)

**Audience:** the next Claude Code session.

---

## TL;DR

**Lane B fix wave for `roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md` complete.** The user-visible 2.5-minute UI freeze on context rebuild is **gone**. Two distinct fixes shipped:

- **B3a (algorithmic):** `detectModules` 86,690ms → 1,059ms (82× faster). Three accidental O(N²) loops over the unfiltered 46,302-file repoIndex were eating 96% of the freeze. Diagnostician's top hypothesis (synchronous SQLite fan-out) was **refuted** by per-phase instrumentation re-added in this wave — the bug was pure-JS, not graph queries.
- **B3b (worker offload):** moved `generateRepoMap` to a dedicated worker thread with its own read-only `better-sqlite3` connection. The residual 4.9s of graph queries (`enrichSummaries`, `crossModuleDeps`, `hotspotScores`) now runs off-main; UI stays responsive.

**9 commits ahead of `origin/master`. Push when CI Actions minutes refresh (~2026-06-01).**

**⚠️ B4 manual verification surfaced two pre-existing bugs (neither caused by this wave; both filed):**
1. **`2026-05-17-chatstatenewpath-dynamic-require-threadstore.md`** — Wave 86 chunker bug. Dynamic `require()` of `./threadStore` resolves to a non-existent chunk file at runtime. Failed first-attempt fix documented; needs path C (refactor `threadStore.ts` to lazy-init `agentChatThreadStore`).
2. **`2026-05-17-silent-buildrepoindex-hang-post-graph-ready.md`** — `forceRebuild` after graph-ready hangs silently in `buildRepoIndex`, never completing. No exception, no completion log. Phase 4's new visibility surfaced this; Phase 3 B4 verification log also lacks the completion line in retrospect. Net-positive vs pre-wave (freeze gone), but the post-graph-ready re-run isn't actually firing.

---

## Wave commit log (this session)

| Commit | Phase | What |
|---|---|---|
| `243c1938` | B3a | O(N²) fix in `detectModules` — singleFiles (51s→44ms), flatGroups (28s→188ms), featureFolders (7s→244ms) |
| `5f8385d0` | B3a cleanup | Bring `243c1938` under ESLint max-lines caps (post-commit staging race) |
| `76318a84` | doc | File `chatStateNewPath` threadStore chunker bug (pre-existing) |
| `868f7240` | doc | B3b architecture plan — option A: worker opens own read-only sqlite via WorkerQueryClient shim |
| `54d3d68f` | B3b Ph1 | Worker IPC scaffold (`repoMapWorkerClient` + `repoMapWorker` + types) + orchestrator-authored acceptance test (6 assertions) |
| `9d21d1e5` | B3b Ph2 | `WorkerQueryClient` + `getQuerySource()` thread-aware injection in 3 graph-consumer files |
| `c743c8fd` | B3b Ph3 | Production wiring — `main.ts` injects `generateRepoMapFn` into `ContextLayerConfig`; controller `runFullRebuild` uses it with one-shot in-process soft-fallback on worker failure |
| `bbfe6c99` | B3b Ph4 | Worker lifecycle traces (`[trace:repoMap-worker] spawning/ready/request/response/error`) + stdout/stderr piping (`[worker:repoMap] ...`) so worker-internal `[trace:generateRepoMap] phase=...` lines are visible in main dev console |
| `fc25e592` | doc | File silent `buildRepoIndex` hang (pre-existing; surfaced by Phase 4 visibility) |

## Per-phase numbers (verified in B4)

| Detector | Before | After |
|---|---:|---:|
| featureFolders | 7,024ms | 244ms |
| flatGroups | 27,959ms | 188ms |
| singleFiles | 51,293ms | 44ms |
| **detectModules total** | **86,690ms** | **1,059ms (82× faster)** |
| **generateRepoMap total** | **89,556ms** | **4,892ms (18× faster)** |
| Worst observed `[jank]` during rebuild | **152,165ms** | **none** (worker offload + UI stays responsive) |

---

## What's still uncommitted at session close

Two pre-existing modifications carried throughout the session, untouched:
- `roadmap/follow-ups/2026-05-05-electron-renderer-browser-mcp-wiring.md`
- `tools/__fixtures__/train-context/test-output-weights.json`

Working tree otherwise clean.

---

## Open follow-ups (post-Lane-B-wave)

In `roadmap/bugs/`:
- **`2026-05-17-chatstatenewpath-dynamic-require-threadstore.md`** — OPEN, medium severity. **Recommended next Lane B.** Path C in the bug doc (refactor `threadStore.ts` to lazy-init `agentChatThreadStore`) is the right shape. ~half-day.
- **`2026-05-17-silent-buildrepoindex-hang-post-graph-ready.md`** — TRIAGED, medium severity. Diagnostic plan in the bug doc: instrument `buildRepoIndexSnapshot` + `orchestration/contextWorker.ts`, find which trace line is the last to fire. Probably a deadlock / race / quiet "already running" guard.
- `2026-05-16-main-thread-hang-on-context-rebuild.md` — **RESOLVED** by this wave. Bug doc updated with full B3a + B3b post-mortem.
- `2026-05-15-e2e-teardown-hang.md` — still open (Wave 93 carry-over).

In `roadmap/follow-ups/`:
- **`2026-05-16-wave-89-deferred-smoke-gate.md`** — STILL OPEN. Wave 89 smoke walk was deferred because the hang made it impossible. Hang is fixed → smoke walk is now unblocked. Highest-priority follow-up.
- `2026-05-17-move-generateRepoMap-to-worker.md` — RESOLVED by this wave (kept for history). Companion `*-plan.md` also resolved.
- `2026-05-16-wave-89-tool-bridge-runtime-smoke.md`, `*-stacked-dock-integration-test.md`, `*-dead-useWorkbenchCompare-hook.md` — pre-existing Wave 89 carry-overs.
- `2026-05-05-electron-renderer-browser-mcp-wiring.md` — pre-existing.

---

## What to do next

1. **Push the 9 wave commits.** Gated on GitHub Actions minutes refresh (~2026-06-01). Pre-push the marker IS still required (per Wave 92 lockfile guard); no lockfile changes in this wave so push will pass cleanly.

2. **Walk Wave 89's deferred smoke gate.** The hang that blocked it is now fixed. Highest-priority follow-up. Full checklist preserved in `roadmap/follow-ups/2026-05-16-wave-89-deferred-smoke-gate.md`.

3. **Lane B fix wave for `2026-05-17-chatstatenewpath-dynamic-require-threadstore.md`** (recommended next bug). Path C in the bug doc is grounded — refactor `threadStore.ts` so `agentChatThreadStore` isn't initialized at module load. ~half-day scope. Tests broke on the first-attempt fix because the lazy-require pattern was load-bearing; the post-mortem in the bug doc explains why.

4. **Lane B fix wave for `2026-05-17-silent-buildrepoindex-hang-post-graph-ready.md`.** Diagnostic plan: add `[trace:buildRepoIndex]` + `[trace:contextWorker]` lines, reproduce, identify the deadlock. Existing B3a/B3b trace plumbing will catch the unhang side-effect cleanly.

5. **Wave 90 — interactive `claude` substrate** (unchanged from prior handoff; wire `primary` dock slot to a long-running `claude` session).

6. **Wave 91 — `-p` substrate cleanup** (unchanged from prior handoff).

---

## Lane B B3a + B3b — context for the next wave

### Files added/modified across the wave

**New files (all under `src/main/contextLayer/`):**
- `repoMapGeneratorSizeCap.ts` (+ test) — extracted from `repoMapGenerator.ts` to fit max-lines:300 after re-adding phase trace logging
- `moduleDetectorSingleFile.ts` (+ test) — extracted from `moduleDetector.ts` for the same reason
- `moduleDetectorUtils.test.ts` — added DirIndex contract tests + utility regressions for the rewritten `hasAnyPrefixGroup`
- `repoMapWorkerTypes.ts` (+ test) — message protocol
- `repoMapWorkerClient.ts` (+ test + `acceptance.test.ts`) — main-thread singleton client
- `repoMapWorker.ts` (+ test) — worker entry point
- `repoMapWorkerQueryClient.ts` (+ test) — worker-local `GraphDatabase(readonly) + CypherEngine` shim
- `repoMapGeneratorQuerySource.ts` (+ test) — `isMainThread`-aware switch between `getGraphController()` and `getWorkerQueryClient()`

**Modified files:**
- `repoMapGenerator.ts` — phase trace logging via `tracedPhase` helper + extracted `runRepoMapPhases` + `finalizeRepoMap` helpers
- `moduleDetector.ts` — `DirIndex` reuse across all detectors, sub-phase trace logging, sorted+adjacent LCP rewrite
- `moduleDetectorUtils.ts` — `DirIndex` interface + `buildDirIndex` + `hasAnyPrefixGroup` O(N log N) rewrite
- `moduleDetectorSingleFile.ts` — uses `dirIndex.allByDir.get(relDir)` for companion lookup
- `repoMapGeneratorGraph.ts`, `repoMapGeneratorRanking.ts`, `repoMapGeneratorDeps.ts` — replaced `getGraphController()` with `getQuerySource()` at 5 call sites
- `contextLayerTypes.ts` — added `GenerateRepoMapFn` type + `generateRepoMapFn?: GenerateRepoMapFn` on `ContextLayerConfig`
- `contextLayerController.ts` — `runFullRebuild` uses `this.config.generateRepoMapFn ?? generateRepoMap` with one-shot soft-fallback on rejection
- `main.ts` — injects `generateRepoMapFn: (opts) => getRepoMapWorkerClient().generateRepoMap(opts)` into the config spread
- `electron.vite.config.ts` — added `repoMapWorker` entry alongside `indexingWorker` / `contextWorker`

### Trace lines preserved as baseline observability

These fire on every context rebuild. They're load-bearing for catching future regressions in this exact subsystem (which has now demonstrated twice that it's a perf foot-gun):

```
[context-layer] generateRepoMap routed via worker      ← one-time at controller init
[trace:repoMap-worker] spawning worker                 ← lazy spawn (first call)
[trace:repoMap-worker] ready                           ← worker handshake
[trace:repoMap-worker] request id=N                    ← per generateRepoMap call
[worker:repoMap] [trace:generateRepoMap] start ...     ← worker stdout pipe
[worker:repoMap] [trace:generateRepoMap] phase=detectModules ms=N modules=M
[worker:repoMap] [trace:detectModules] phase=featureFolders ms=N added=M
[worker:repoMap] [trace:detectModules] phase=configGroup ms=N
[worker:repoMap] [trace:detectModules] phase=flatGroups ms=N added=M
[worker:repoMap] [trace:detectModules] phase=singleFiles ms=N added=M
[worker:repoMap] [trace:detectModules] done totalMs=N modules=M
[worker:repoMap] [trace:generateRepoMap] phase=structuralSummaries ms=N
[worker:repoMap] [trace:generateRepoMap] phase=crossModuleDeps ms=N edges=M
[worker:repoMap] [trace:generateRepoMap] phase=enrichSummaries ms=N summaries=M
[worker:repoMap] [trace:generateRepoMap] phase=hotspotScores ms=N scored=M
[worker:repoMap] [trace:hotspotScores] start — modules=N
[worker:repoMap] [trace:hotspotScores] done — modules=N totalMs=M
[worker:repoMap] [trace:generateRepoMap] done totalMs=N
[trace:repoMap-worker] response id=N workerMs=M
```

Soft-fallback path (if the worker errors):
```
[trace:repoMap-worker] worker error id=N message=...
[context-layer] worker generateRepoMap failed — falling back to in-process
[trace:generateRepoMap] start ...                      ← in-process trace, same shape
```

### B3b architectural decisions worth carrying forward

- **WAL multi-reader is the load-bearing primitive.** `graphDatabase.ts:68` sets `journal_mode = WAL`; worker opens `new GraphDatabase(dbPath, { readonly: true })` from `workerData.dbPath`. Risk #4 in the plan was "does the readonly+explicit-path constructor still call `getDbPath()` internally" — verified NO at `graphDatabase.ts:59` (`dbPath ?? getDbPath()` with `??` short-circuiting).
- **Mirror `indexingWorker.ts`'s pattern of passing `dbPath` via `workerData`** — `electron.app.getPath('userData')` fails in workers; main computes path before spawn and hands it over.
- **Logger is worker-safe** — `logger.ts:41-53` maps `log.info` to `console.warn` in workers, so trace lines emit correctly.
- **Project-name for `CypherEngine` in worker is `'__worker__'`** — all three consumer queries filter by `file_path STARTS WITH`, not by project node, so the name is irrelevant today. Heads-up for future consumers adding project-scoped queries.

---

## Session-specific lessons (worth not repeating)

1. **`npm ci --ignore-scripts` is a footgun.** Mid-session recovery of `node_modules` (triggered by the diagnostician's worktree investigation damaging `.bin` and `@babel/core`) used `--ignore-scripts` to skip the long postinstall, which also skipped `better-sqlite3`'s ABI rebuild. Result: app crash on next launch with `Could not locate the bindings file`. Recovery: `npx electron-rebuild -f --only better-sqlite3`. **Lesson:** if recovering node_modules mid-session, take the postinstall hit. The minutes saved aren't worth the broken native bindings.
2. **`electron-rebuild -w <pkg>` vs `--only <pkg>`** — `-w` is a *filter*, but rebuild still walks the dep tree and fails on broken siblings (node-pty in this env, missing Spectre-mitigated libs). `--only <pkg>` skips everything else cleanly. Use `--only`.
3. **Diagnostician hypotheses are hypotheses.** B3a's diagnostician identified synchronous SQLite fan-out as top-1 with high confidence — verified by per-phase instrumentation as **wrong** (the SQLite calls are 2.1s of a 152s block; pure-JS loops are 96%). Don't skip B2 verification because the hypothesis "sounds right."
4. **Sub-agent dispatched fixes can have semantic gaps the dispatcher misses.** The haiku-implementer threadStore fix applied the diagnostician's spec correctly but broke 33 tests because the lazy-require pattern was load-bearing for reasons NEITHER the spec NOR the haiku surfaced. Always verify gates yourself before committing; revert cleanly if the gates speak. The bug doc captures the failed-attempt context so the next fix wave doesn't repeat the same swing.
5. **Trace-line visibility surfaces invisible bugs.** Phase 4 of B3b added stdout/stderr piping for trace visibility. That immediately surfaced a pre-existing silent hang in `buildRepoIndex` that Phase 3 verification also exhibited but went unnoticed. **Baseline observability isn't a nice-to-have — it's the difference between "fixed" and "actually fixed."**

---

## Stashed work (preserved)

- `stash@{0}` — "pre-pivot WIP: wave-87 chat-orchestration + wave-m5 docs" (untouched).
- `wave-87-chat-orchestration-cleanup` branch — 16 local-only commits, untouched. Wave 88→89 supersedes substrate goals; resurrect or abandon — Cole's call.

## Vendor knowledge

`/promote-vendor-lessons` for this wave — likely no-op. No new vendor SDK touched. The `better-sqlite3` ABI mismatch lesson is process-level (about `npm ci --ignore-scripts`), not vendor-specific; lives in the session-specific lessons section above and the bug docs.
