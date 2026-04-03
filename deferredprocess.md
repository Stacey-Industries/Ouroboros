# Deferred Process Plan

## Goal

Offload handle-heavy and latency-tolerant work out of the Electron main process into one or more dedicated child processes so:

- main-process handle count stays stable under long sessions
- `EMFILE` in unrelated subsystems does not break approvals, bounds writes, or UI-critical behavior
- watcher, indexing, and search failures are isolated and restartable

## Why This Is Needed

Current symptoms point to the Electron main process accumulating too many open handles over time. Worker threads do not solve this because they share the same process handle budget. A separate process does.

## What Should Move First

Highest ROI candidates:

- file watching from `src/main/ipc-handlers/files.ts`
- rules/skills watching from `src/main/rulesAndSkills/rulesWatcher.ts`
- graph/index/search workloads
- local socket servers if they continue to contribute to handle growth

Keep in main process:

- window lifecycle
- approvals
- menu/app wiring
- preload-facing IPC registration
- short synchronous config reads/writes

## Recommended Architecture

Create a new dedicated sidecar process, for example:

- `src/main/deferredProcess/`

Suggested split:

1. `deferredProcessHost.ts`
   Starts/stops the sidecar from the Electron main process.
2. `deferredProcessProtocol.ts`
   Shared message types for request/response/event traffic.
3. `deferredProcessChild.ts`
   Entry point for the child process.
4. `deferredProcessRouter.ts`
   Dispatches commands inside the child.
5. `deferredProcessWatchers.ts`
   Owns chokidar and any future watcher pooling.
6. `deferredProcessSearch.ts`
   Owns recursive content search.
7. `deferredProcessGraph.ts`
   Owns graph indexing/reindexing if moved.

Use a single long-lived child process first. Do not start with multiple micro-processes.

## IPC Contract

Use structured messages over Node IPC:

- request: `{ id, type, payload }`
- response: `{ id, ok, payload?, error? }`
- event: `{ type, payload }`

Required behaviors:

- child can emit file-change events back to main
- main can restart child if it exits unexpectedly
- requests have timeouts
- child startup is lazy or boot-time, but singleton
- protocol is versioned or at least centralized in one shared types file

## Phase 1

Move only watcher ownership.

Tasks:

- add deferred-process host lifecycle in main startup/shutdown
- move `chokidar.watch(...)` creation out of `files.ts`
- move rules/skills watcher creation out of `rulesWatcher.ts`
- keep renderer-facing IPC channels unchanged
- have main forward `files:watchDir` and `files:unwatchDir` to the child
- have child emit normalized file-change events back to main
- preserve current ignore patterns and watcher deduping semantics

Acceptance criteria:

- renderer behavior is unchanged
- file changes still reach renderer/web clients
- main-process handle count no longer grows with watched directories the same way it does today
- killing the child does not crash Electron; it is logged and restartable

## Phase 2

Move recursive search.

Tasks:

- move the implementation behind `src/main/ipc-handlers/search.ts` into the child
- keep the existing IPC channel stable
- support cancellation/timeouts from main

Acceptance criteria:

- search results match current behavior
- search no longer contributes file descriptors to the main process

## Phase 3

Move graph/indexing if needed.

Tasks:

- decide whether graph worker logic stays under main-owned orchestration or moves fully to the child
- if moved, child owns graph lifecycle and reindex requests
- main becomes a thin proxy

Acceptance criteria:

- graph queries still work
- reindex failures are isolated from the Electron main process

## Main-Process Changes Needed

- add `startDeferredProcess()` and `stopDeferredProcess()` calls in main lifecycle
- add health tracking and restart backoff
- add a small in-memory request map with timeout cleanup
- add logging for:
  - child pid
  - unexpected exits
  - restart count
  - request timeout count

## Child-Process Requirements

- no Electron imports
- no BrowserWindow access
- pure Node-only implementation
- explicit cleanup of all watchers/servers on shutdown
- bounded retries
- bounded queue sizes

## Observability

Before and after the offload, log:

- main-process handle count
- child-process handle count
- watched-directory count
- active watcher count
- search request count
- restart count

Add one diagnostics command or internal API to dump:

- process role
- pid
- uptime
- active watcher count
- active request count

## Risks

- duplicated watcher state between main and child if rollout is partial
- request/response races during hot reload or window reload
- event storms if child forwards raw change traffic without batching
- accidental Electron imports in the child process

## Guardrails

- keep renderer API unchanged
- move one subsystem at a time
- add restart-safe behavior before moving more workloads
- prefer batching/coalescing file-change events at the child boundary

## Definition Of Done

- main process no longer owns chokidar watchers directly
- main process survives long sessions without approval-response `EMFILE` failures
- handle growth is measurable and attributed by process
- deferred process can be restarted without restarting the app
