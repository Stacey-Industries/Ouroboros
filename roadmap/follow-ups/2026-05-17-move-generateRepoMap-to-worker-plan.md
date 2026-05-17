---
status: PLANNED
created: 2026-05-17
updated: 2026-05-17
---

# B3b Architecture Plan — Move `generateRepoMap` to a Worker Thread

Companion to `roadmap/follow-ups/2026-05-17-move-generateRepoMap-to-worker.md` (the brief). Produced by `sonnet-architect` 2026-05-17 after reading the brief, the bug doc, the contextLayer subsystem, and the existing worker infrastructure (`indexingWorker.ts`, `contextWorker.ts`).

## Decision

How to move `generateRepoMap` off the Electron main thread while preserving access to the codebase-memory graph DB for three of its five phases.

## Constraints (verified against the codebase)

- WAL mode confirmed (`graphDatabase.ts:68`): `db.pragma('journal_mode = WAL')` — multiple concurrent readers are safe.
- `indexingWorker.ts` already opens its own `GraphDatabase` connection in a worker thread — direct, established precedent.
- `getDbPath()` calls `require('electron').app.getPath('userData')` — this fails in workers. The `indexingWorker.ts` comment (line 34) documents the fix: main passes resolved `dbPath` via `workerData`. Same constraint applies here.
- The existing `contextWorker.ts` explicitly does NOT call `getGraphController()` (by design — comment at line 9). `generateRepoMap` is already in that worker for the warm-up path, but with graph queries soft-falling back to empty arrays.
- Logger is worker-safe (`logger.ts:41–53`): `log.info` maps to `console.warn` in workers — ESLint-compliant, already established. Trace lines will still emit.
- Three graph-consumer files (`repoMapGeneratorGraph.ts`, `repoMapGeneratorRanking.ts`, `repoMapGeneratorDeps.ts`) call `getGraphController()`. Each already has an `if (!ctrl) return []` soft-fallback. The seam for injection is just the `getGraphController()` call.
- The post-graph-ready trigger path is `triggerContextLayerRebuildAfterGraphReady` → `ctrl.forceRebuild()` → `generateRepoMap` — all synchronous on main. This is the path that produces the 1–2s freeze. The periodic warm-up path (via `contextWorker.ts`) is already off-main.
- `RepoIndexSnapshot` is confirmed JSON-safe (contextWorker posts it back to main today). `RepoFacts` needs a structured-clone audit.
- `RepoMap` at Sonnet cap is ~12 KB — `postMessage` cost is sub-millisecond.
- ESLint `max-lines: 300` cap is a real constraint on file additions.
- `busy_timeout = 5000` already set in `applyPragmas` — WAL lock transient contention is covered.

## Options considered

### Option A: Worker opens its own read-only SQLite connection

**Pros:** Full 4.9s offload. Established precedent (`indexingWorker.ts`). Soft-fallback already coded. No per-query IPC overhead.

**Cons:** Need a `WorkerQueryClient` shim (~50 lines) to provide `queryGraph()` without pulling in the full `GraphControllerCompat` lifecycle. Three graph-consumer modules need dependency-injection point changed.

**Integration cost:** Medium. New `WorkerQueryClient`, modified injection in 3 files, new vite entry point.

**Risk:** `electron.app.getPath` failure in worker (known, documented, fixed by passing `dbPath` via `workerData`). WAL checkpoint starvation (not practical — queries are atomic, no long-held read transactions).

### Option B: Worker marshals Cypher queries back to main via IPC

**Pros:** No DB plumbing in worker. Graph controller stays on main.

**Cons:** ~150 postMessage round-trips per rebuild. Main thread executes queries when it receives messages — Cypher phases (~2.7s) still run on main, just in response to IPC. Net benefit: only ~1.7s pure-JS phases are truly off-main. Freeze drops from 4.9s to 2.7s spread over many interruptions — still noticeable.

**Integration cost:** Low plumbing, but partial benefit means B3b doesn't fully solve the stated goal.

**Risk:** Main-thread saturation during rebuild slows query response times.

### Option C: Split — pure-JS phases in worker, graph phases stay on main

**Pros:** Simplest marshaling. No DB plumbing.

**Cons:** Main still blocked for ~2.7s. Does not eliminate the freeze.

**Integration cost:** Low.

**Risk:** Ships an incomplete fix; likely needs B3c.

## Recommendation

**Option A — Worker opens its own read-only SQLite connection.**

The codebase has solved this problem once already (`indexingWorker.ts`). The WAL multi-reader guarantee covers the concurrency case. The only new code is a `WorkerQueryClient` (~50 lines: `GraphDatabase` read-only + `CypherEngine` instance) and a `getQuerySource()` injection point in three files. This is the only option that fully eliminates the main-thread freeze. Confidence: high.

Runner-up is Option B. Would tip toward it only if `CypherEngine` were deeply entangled with main-thread singletons — it is not; `CypherEngine` depends only on a `GraphDatabase` handle.

## Integration shape

### New files

**`src/main/contextLayer/repoMapWorkerTypes.ts`** — Message protocol (plain JSON-safe types only, same discipline as `contextWorkerTypes.ts`):

```typescript
// Main → Worker
interface GenerateRepoMapRequest {
  type: 'generateRepoMap';
  id: string;
  repoFacts: RepoFacts;
  repoIndex: RepoIndexSnapshot;
  workspaceRoot: string;
  model?: string;
}

// Worker → Main
type RepoMapWorkerResponse =
  | { type: 'ready' }
  | { type: 'repoMapReady'; id: string; repoMap: RepoMap; durationMs: number }
  | { type: 'error'; id: string; message: string };
```

**`src/main/contextLayer/repoMapWorkerQueryClient.ts`** — Worker-local query shim. Opened once at worker bootstrap from `workerData.dbPath`:

```typescript
// Exposes: initWorkerQueryClient(dbPath), getWorkerQueryClient()
// WorkerQueryClient wraps: new GraphDatabase(dbPath, { readonly: true }) + new CypherEngine(db)
// Provides: queryGraph(cypher): Array<Record<string, unknown>>
```

**`src/main/contextLayer/repoMapWorker.ts`** — Worker entry point:

```
1. Receive workerData: { dbPath: string }
2. initWorkerQueryClient(dbPath)
3. post({ type: 'ready' })
4. On message { type: 'generateRepoMap', id, ... }:
     await generateRepoMap(opts)  ← uses worker-local query client via getQuerySource()
     post({ type: 'repoMapReady', id, repoMap, durationMs })
```

**`src/main/contextLayer/repoMapWorkerClient.ts`** — Main-thread owner:

```
- Singleton long-lived worker (lazy spawn, same __dirname/chunks guard)
- workerData: { dbPath: getDbPath() }  ← resolved on main before spawn
- generateRepoMap(opts): Promise<RepoMap>
    - Assigns UUID id, registers resolver in in-flight Map
    - 30s timeout → reject + log
    - On worker crash → reject all in-flight, null worker, retry on next call
    - In-process fallback: if worker unavailable, call generateRepoMap() directly
```

**`src/main/contextLayer/repoMapWorkerClient.acceptance.test.ts`** — Orchestrator-authored boundary test (created as `describe.skip` in Phase 0, un-skipped before implementer dispatch in Phase 1).

### Modified files

**`src/main/contextLayer/repoMapGeneratorGraph.ts`**, **`repoMapGeneratorRanking.ts`**, **`repoMapGeneratorDeps.ts`** — Replace `getGraphController()` call with:

```typescript
import { isMainThread } from 'worker_threads';
import { getWorkerQueryClient } from './repoMapWorkerQueryClient';

function getQuerySource() {
  return isMainThread ? getGraphController() : getWorkerQueryClient();
}
```

**`electron.vite.config.ts`** — Add `repoMapWorker.ts` as a second worker entry under the main process build (same pattern used for `contextWorker.ts`).

**`src/main/mainStartupContextLayerTrigger.ts`** — Replace `ctrl.forceRebuild()` with a call to `repoMapWorkerClient.generateRepoMap(opts)`, then hand the result to the controller for cache update and downstream notification.

### Migration order (walking-skeleton-first)

**Phase 0 (orchestrator):** Author `repoMapWorkerClient.acceptance.test.ts` as `describe.skip`. Confirm it fails when un-skipped.

**Phase 1 (implementer):** Scaffold all new files. Worker initially calls in-process `generateRepoMap` (no `WorkerQueryClient` yet — proves the IPC boundary). Vite entry point added. Acceptance test passes (worker spawns, IPC round-trip works).

**Phase 2 (implementer):** Implement `WorkerQueryClient`. Wire `getQuerySource()` into three graph-consumer modules. Worker now executes graph queries locally against read-only DB. Unit tests for the three modules updated to mock at `repoMapWorkerQueryClient` level.

**Phase 3 (implementer):** Wire `repoMapWorkerClient` into `triggerContextLayerRebuildAfterGraphReady`. Manual smoke confirms trace lines appear and no `[jank]` fires during rebuild. This is the B3b acceptance criterion.

**Phase 4 (implementer):** Add `[trace:repoMap-worker]` boundary log lines on both sides. Clean up any investigation-only logging per B5 discipline.

### Observability

The existing `[trace:generateRepoMap] phase=... ms=...` lines emit from `logger.ts` which maps to `console.warn` in worker context. They will appear in the Electron dev console. No change needed. Optionally prefix with `[worker]` for log-source attribution — defer unless it causes confusion.

### Trace log verification (B3b acceptance criterion)

After Phase 3: start app cold, open Agent IDE workspace, wait for `[system2] initial index complete`, watch for `[trace:post-graph-forceRebuild] triggered`. Confirm:
- `[trace:generateRepoMap] phase=...` lines appear (from worker stdout)
- `[trace:generateRepoMap] done totalMs=~5000` appears
- No `[jank] event loop blocked` during the rebuild window

## Risks for the implementation phase

1. **`electron.app.getPath` in worker.** Must pass `dbPath` via `workerData` — not call `getDbPath()` inside the worker. Pattern: `workerData: { dbPath: getDbPath() }` set on the main thread before `new Worker(...)`. See `indexingWorkerClient.ts:39` for the exact pattern.

2. **`RepoFacts` structured-clone safety.** Implementer must audit `RepoFacts` for non-cloneable fields (class instances, `Map`, `Set`, `Date` objects). If any are found, they must be serialized to plain objects before postMessage. `RepoIndexSnapshot` is already confirmed safe (contextWorker posts it back to main today).

3. **Vite entry point omission.** If `repoMapWorker.ts` is not added to the vite config, `new Worker(workerPath)` throws `ENOENT` at runtime. Verify in Phase 1 by checking that `out/main/repoMapWorker.js` exists after `npm run build`.

4. **CypherEngine import chain.** `CypherEngine` imports `GraphDatabase`. `GraphDatabase` imports from `graphDatabaseHelpers` which calls `getDbPath()` — but only if `dbPath` arg is not passed to the constructor. The read-only path (`new GraphDatabase(dbPath, { readonly: true })`) never calls `getDbPath()` internally. Verify this during Phase 2.

5. **ESLint `max-lines: 300` on `contextLayerTypes.ts`.** If `GenerateRepoMapOptions` or new config fields need to land in this file, check the current line count first. The file splits in this subsystem are deliberate (`contextLayerController` → `Support` → `Helpers`) — same discipline applies.

6. **Mock-level change for three unit tests.** `repoMapGeneratorGraph.test.ts`, `repoMapGeneratorRanking.test.ts`, `repoMapGeneratorDeps.test.ts` currently mock `graphControllerSupport.getGraphController`. After Phase 2, the production path in worker context calls `getWorkerQueryClient()` instead. The tests run in the main thread (`isMainThread === true`), so the `getQuerySource()` function will still call `getGraphController()` — the existing mocks remain valid. No mock changes needed.

7. **`forceRebuild` seam in `contextLayerController`.** Two injection options: (a) `generateRepoMapFn` in `ContextLayerConfig`; (b) bypass `forceRebuild()` at the trigger site and call the controller's cache-update method directly. Option (a) is cleaner (controller remains the orchestrator of its own state) but touches the config type. Option (b) is more surgical but creates coupling. Implementer should prefer option (a) unless `contextLayerTypes.ts` is near the 300-line cap.

## Sources

- [WAL Mode and Performance Tuning — better-sqlite3 DeepWiki](https://deepwiki.com/WiseLibs/better-sqlite3/3.4-wal-mode-and-performance-tuning)
- [Scaling SQLite with Node worker_threads and better-sqlite3 — DEV Community](https://dev.to/lovestaco/scaling-sqlite-with-node-worker-threads-and-better-sqlite3-4189)
- [SQLite WAL concurrency: multiple readers, single writer — iifx.dev](https://iifx.dev/en/articles/17373144)
- Existing codebase precedent: `src/main/codebaseGraph/indexingWorker.ts` (worker opens own `GraphDatabase`), `src/main/codebaseGraph/autoSync.ts:296` (WAL lock contention comment)

## Open question for the user (blocking)

**`forceRebuild` seam design.** Architect recommends option (a): add `generateRepoMapFn?: (opts: GenerateRepoMapOptions) => Promise<RepoMap>` to `ContextLayerConfig`, defaulting to the in-process function. The trigger overrides it with the worker-client version. This keeps the controller in charge of its own cache lifecycle.

Option (b) bypasses `forceRebuild()` at the trigger site and calls a cache-update method on the controller directly — more surgical but creates coupling between the trigger and the controller's internals.

Default to (a) if no preference; surfacing because it determines the file-touch surface and the controller's exposed API.
