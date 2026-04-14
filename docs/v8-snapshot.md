# V8 Snapshot Readiness Report — 2026-04-13

## Summary

This report audits `src/main/**/*.ts` for V8-snapshot-hostile patterns (module-level side effects that cannot be serialised into a snapshot), refactors the most critical ones in `main.ts`, and documents the path to full snapshot integration.

A V8 snapshot freezes the JavaScript heap immediately after module loading. Any code that calls Electron/Node APIs at module scope (before `app.whenReady()`) will either crash during snapshot creation or produce a broken snapshot. The goal of this package is to make the codebase _snapshot-ready_ without yet wiring `electron-link`.

---

## Startup timings (before/after lazy-init cleanup)

Real measurement requires launching the packaged Electron app and reading `perfMetrics.getStartupTimings()` at the `services-ready` mark. This environment cannot spawn an interactive Electron process, so empirical numbers are not available here.

**Estimated impact of the refactor:**

| Phase | Before | After | Notes |
|---|---|---|---|
| Module parse + eval | ~8 Electron/Node API calls at top level | ~0 at true module scope | bootstrap calls execute synchronously before event loop yields — wall time unchanged |
| `app-ready` → `window-created` | Unchanged | Unchanged | No services moved; only code structure changed |
| `app-ready` → `services-ready` | Unchanged | Unchanged | Execution order preserved exactly |

The refactor is structural (snapshot-preparedness), not a performance optimisation. Actual cold-start improvement only materialises after `electron-link` snapshot integration. To measure before/after empirically:

```
// Add temporarily to initializeApplication() in main.ts, right after markStartup('services-ready'):
log.info('[perf] startup timings:', JSON.stringify(getStartupTimings()));
```

Then compare app launch logs before and after snapshot integration.

---

## Snapshot-safe modules (480 of 489 audited)

All modules not listed in the hostile table below are safe: they contain only `import`, `export`, `const`/`let`/`var` declarations, `function` declarations, `class` declarations, `interface`/`type` definitions, and `enum` declarations at the top level. No Electron API calls, no `new Foo()` at scope, no side-effectful function calls.

---

## Snapshot-hostile modules (9 production files)

Test files are excluded — `describe()` calls in `.test.ts` files are expected and non-hostile in production.

| Module | Violation | Pattern | Fix effort |
|---|---|---|---|
| `src/main/main.ts` | `bootstrapProcessHandlers()`, `bootstrapCrashReporter()`, `bootstrapApp()`, `ensureSingleInstance()` at lines 113–116 | call-at-module-scope | **Done** — these 4 calls are the intentional synchronous bootstrap; they replace 8 direct Electron API calls that were previously naked at module scope. The remaining `app.whenReady().then(...)` and `app.on(...)` calls are unavoidable entry-point wiring. |
| `src/main/main.ts` | `app.whenReady().then(initializeApplication)`, `app.on('window-all-closed', ...)`, `app.on('will-quit', ...)`, `app.on('web-contents-created', ...)` | electron-api-at-module-scope | **Known necessary** — these are the top-level event loop hooks that must remain at module scope in the entry-point file. `electron-link` handles these specifically via its `snapshottable` annotation. Low effort once electron-link is wired. |
| `src/main/pipeAuth.ts` | `seedFromWorkerData()` at line 45 | call-at-module-scope | **Intentional** — seeds worker-thread pipe tokens from `workerData` at load time. Extracting this is unsafe (race: the worker may process messages before seeding). Annotate as `// @snapshot-hostile: intentional` if electron-link is integrated. |
| `src/main/codebaseGraph/graphWorker.ts` | `parentPort?.on('message', ...)` and `post({ type: 'ready' })` at lines 122, 126 | call-at-module-scope | **Worker-entry pattern** — workers require top-level message listener registration. Not actually snapshot-hostile (workers run in separate V8 isolates, not snapshotted). Low real-world impact. |
| `src/main/orchestration/contextWorker.ts` | Same pattern as graphWorker.ts | call-at-module-scope | Same as above — worker entry point. Not a snapshot concern. |
| `src/main/contextLayer/contextLayerController.ts` | `setControllerFactory(...)` at line 69 | call-at-module-scope | **Medium effort** — factory registration. Could be deferred to an explicit `initContextLayer()` call already in main.ts startup, but the function is already called before any use. |
| `src/main/extensionHost/extensionHostMain.ts` | `bootstrap()` at line 254 | call-at-module-scope | **Worker/utility-process entry** — these are standalone process entry points, not imported by main.ts. Not snapshot targets. |
| `src/main/mcpHost/mcpHostMain.ts` | `bootstrap()` at line 287 | call-at-module-scope | Same as extensionHostMain — standalone process entry. |
| `src/main/ptyHost/ptyHostMain.ts` | `bootstrap()` at line 258 | call-at-module-scope | Same as above — standalone process entry. |

### Known upstream issue

`mica-electron` (imported transitively via `windowManagerHelpers.ts`) calls `app.commandLine.appendSwitch()` at its own module load time. This is wrapped in a try/catch IIFE (`MicaBrowserWindow` constant) in the codebase, but the Electron API call still fires during import — invisible to this scanner because it is inside a variable declaration (not a bare expression statement). This is the canonical snapshot-hostile pattern documented in the CLAUDE.md. Fix effort: **High — upstream fix needed** (or avoid importing `mica-electron` entirely in the snapshot preload phase).

---

## Path to full snapshot

Listed by dependency order (each step requires the previous):

1. **Measure baseline** — Add `log.info(JSON.stringify(getStartupTimings()))` at `services-ready` mark, launch the packaged app, record timings. (~30 min)

2. **Annotate remaining intentional violations** — Add `// @snapshot-hostile: intentional` or `/* snapshottable */` annotations to the 4 known-necessary bootstrap calls and the `pipeAuth.ts` worker-seed call. This makes the audit script's output useful as a regression baseline. (~1 hour)

3. **Extend the audit script for CI** — Change `process.exit(0)` to `process.exit(1)` when any _unannotated_ violation is detected, and add it to the `validate` script. This prevents new regressions. (~1 hour)

4. **Resolve `mica-electron` import** — Either: (a) file an upstream issue; (b) lazy-import `mica-electron` only after `app.whenReady()` via dynamic `import()`; or (c) stub it out in the electron-link snapshot entry. The IIFE wrapping in `windowManagerHelpers.ts` already isolates the failure, but the API call still fires at import time in the real app. (~4 hours)

5. **Install electron-link** — `npm install --save-dev electron-link`. Create a `snapshot-entry.js` that re-exports exactly the modules that should be snapshotted (not including `main.ts` itself — only pure-logic modules). (~2 hours setup)

6. **Wire snapshot into build pipeline** — Add a `build:snapshot` npm script that: (a) runs `electron-link` over the snapshot entry; (b) runs `mksnapshot` via `electron-mksnapshot`; (c) places the `.blob` in `resources/`. Update `electron-builder` config to bundle the blob. (~1 day)

7. **Measure after** — Compare `getStartupTimings()` before/after. Startup gains are typically 200–800 ms on cold launches, depending on module graph size. The renderer (`src/renderer/`) is not affected — it runs in a separate renderer process with its own V8 context.

---

## Recommendation

The `main.ts` refactor (this package) is a prerequisite but delivers no measurable startup improvement by itself. The actual gain requires steps 5–7 above (electron-link + mksnapshot integration), which is a ~2-day specialist effort.

**Recommended next action**: Measure the baseline cold-start time (step 1) before committing to the full integration. If `app-ready` → `services-ready` is already under 1 second (typical for this app size), the ROI of V8 snapshotting may not justify the maintenance burden of the electron-link build pipeline. If it is above 2 seconds, proceed with the full integration.

The audit script (`npm run audit:snapshot`) is now in place to catch regressions regardless of whether full snapshot integration is pursued.
