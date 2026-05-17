---
status: TRIAGED
created: 2026-05-16
updated: 2026-05-16
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

## Why this is a bug, not a follow-up

User-visible severity: 2.5 minutes of UI freeze masquerades as a crash. The user has assumed the app died and restarted; data may be lost. Doesn't gate Wave 89 ship (predates the wave) but should be a near-term Lane B fix wave.

## Promotion criteria

Lane B fix wave at next sweep — Wave 89.x or its own bug-wave. May naturally cluster with the related deferred items: e2e teardown hang (`roadmap/bugs/2026-05-15-e2e-teardown-hang.md`), the doubled-log-lines observation (which may share a root cause), and the `claude-usage-poller` cascade if it turns out to be its own contributor.
