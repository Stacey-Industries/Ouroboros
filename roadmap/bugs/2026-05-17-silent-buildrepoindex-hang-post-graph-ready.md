---
status: TRIAGED
created: 2026-05-17
updated: 2026-05-17
severity: medium
---

# Silent hang in `buildRepoIndex` during post-graph-ready forceRebuild

## Observed signature

Surfaced 2026-05-17 01:30 ET during B4 verification of Lane B B3b Phase 4 (commit `bbfe6c99`). Phase 4 added `[trace:repoMap-worker]` lifecycle traces + worker stdout/stderr piping, which gave us the visibility to detect this.

After `[trace:post-graph-forceRebuild] triggered` and `[context-layer] graph index ready — triggering forceRebuild` fire, **the rebuild silently never completes**. The completion log (`[context-layer] forceRebuild after graph-ready complete — elapsed=Nms`) never appears, even after 6+ minutes of subsequent log activity. No exception fires either — `mainStartupContextLayerTrigger.ts` wraps the await in a try/catch and would log `[context-layer] post-graph-ready rebuild failed:` on rejection. Neither completion nor failure log appears.

Sample timeline (compressed):

```
01:28:59.494 > [context-layer] generateRepoMap routed via worker      ← override in place
...
01:30:04.023 > [system2] initial index complete: 3752 files, 23486 nodes
01:30:04.023 > [trace:post-graph-forceRebuild] triggered — heapMB=44
01:30:04.024 > [context-layer] graph index ready — triggering forceRebuild
01:30:04.694 > [s2-registry] acquired (new) Agent IDE
...
[6+ minutes of normal log activity, NO forceRebuild completion]
```

Notably absent:
- `[trace:repoMap-worker] spawning worker` (would fire on the very first `mapFn(...)` call inside `runFullRebuild`)
- `[trace:generateRepoMap] start ...` (the in-process trace, would fire if soft-fallback hit)
- `[context-layer] forceRebuild after graph-ready complete — elapsed=...`
- `Context cache built via worker in Nms for key: C:\Web App\Agent IDE` (orchestration context-worker completion) — also missing from this run, suggesting the **orchestration context worker is the actual culprit**, not B3b's new repoMap worker.

## Pinpointed: hang is in `buildRepoIndex`, not in `mapFn`

`ContextLayerControllerImpl.runFullRebuild` (`contextLayerController.ts:142`) starts with:

```typescript
const snapshot = await this.buildRepoIndex([this.workspaceRoot]);
...
const mapFn = this.config.generateRepoMapFn ?? generateRepoMap;
newRepoMap = await mapFn({ ... });
```

If the await on `buildRepoIndex` resolved, the worker dispatch would synchronously fire `[trace:repoMap-worker] spawning worker` on the lazy spawn (or skip that line if already spawned and just log `[trace:repoMap-worker] request id=N`). Neither line appears. **The hang is before `mapFn`.**

`buildRepoIndex` is `buildRepoIndexSnapshot` from `src/main/orchestration/repoIndexer.ts`, injected from `main.ts`. That function likely talks to the orchestration context worker. The missing `Context cache built via worker` log confirms the orchestration worker isn't completing its build.

## Why this is pre-existing, not caused by B3b

The Phase 3 B4 verification log (01:00 ET earlier the same day, commit `c743c8fd`) also lacks the `forceRebuild after graph-ready complete` log line. We didn't notice at the time because we were focused on whether the user-visible freeze was gone (it was). Phase 4 surfaced this older problem by giving us visibility into whether the worker actually fired.

Earlier repros that DID see `[trace:generateRepoMap]` fire (e.g., the 00:08 ET run captured in `roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md`) had the orchestration context worker complete first — *then* the rebuild ran. So the post-graph-ready rebuild path only works when the orchestration context worker has already completed at least once during the session. When it hasn't, the rebuild hangs silently waiting.

## User-facing impact

**Net-positive vs the pre-wave baseline:**
- Old: 2.5-minute UI freeze on the rebuild path (the B3a/B3b bug, now fixed)
- New: UI completely responsive, but the post-graph-ready repo-map refresh doesn't actually happen — signatures/hotspots/cross-module-deps from the in-process startup pass are NOT replaced with the fresh-graph versions

**What you lose:** the contextLayer's repo map keeps its cold-start state, which uses the soft-fallback path (signatures = null, hotspot scores empty, file-walk cross-module deps instead of graph-derived). That's degraded context quality for downstream LLM context packets — but it's the same degradation that existed silently before this wave; we just made it visible.

**Severity: medium.** Not user-blocking. Quality regression on context-packet enrichment, but not on app function. Worth fixing in a near-term Lane B.

## Diagnostic plan for the future fix wave

1. **Instrument `buildRepoIndexSnapshot` in `src/main/orchestration/repoIndexer.ts`** — add `[trace:buildRepoIndex] start/done` lines around the function body, plus per-stage traces if it has internal steps.
2. **Instrument the orchestration context worker** (`src/main/orchestration/contextWorker.ts`) — add `[trace:contextWorker] start/done` for whatever the "Context cache built via worker" path is doing.
3. **Reproduce.** Same steps as `roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md`. Look for which trace line is the last one to fire — that's where the hang is.
4. **Likely candidates for the hang itself:**
   - The orchestration context worker queues a build but doesn't actually finish (deadlock, race, or skipped condition)
   - `buildRepoIndexSnapshot` awaits a promise that's never resolved
   - There's a per-controller mutex / cooldown / "already running" guard somewhere that quietly returns/awaits forever
5. **Verify the fix.** After the hang is resolved, the trace lines added in B3a + B3b should fire visibly — `[trace:repoMap-worker]` lifecycle lines AND `[worker:repoMap] [trace:generateRepoMap]` per-phase lines should appear in the dev console after `[context-layer] graph index ready — triggering forceRebuild`.

## Why this is a bug, not a follow-up

Real functional regression in context-packet quality. Tight diagnostic plan with the instrumentation hooks already in place. Surfaced cleanly thanks to Phase 4 of B3b — file as a bug so the next fix wave has the full triage context, not lost as an inline note inside a result brief.

## Relationship to other open bugs

- `2026-05-16-main-thread-hang-on-context-rebuild.md` — resolved by B3a algorithmic fix + B3b worker offload. THIS bug is the previously-invisible reason the post-graph-ready re-run wasn't producing the freeze that B3a/B3b also addressed via the worker. Sibling investigation.
- `2026-05-17-chatstatenewpath-dynamic-require-threadstore.md` — unrelated; pre-existing Wave 86 chunker bug.
