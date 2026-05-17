---
status: TRIAGED
created: 2026-05-17
updated: 2026-05-17
severity: medium
---

# `[chatStateNewPath]` startup errors: dynamic `require('./threadStore')` resolves to a non-existent chunk file

## Observed signature

At app startup on `master @ c743c8fd` (2026-05-17 00:59 ET), three errors fire in sequence from `[chatStateNewPath]`:

```
[chatStateNewPath] rebuildRegistryFromSqlite failed
  err: Cannot find module './threadStore'
    Require stack:
    - C:\Web App\Agent IDE\out\main\chunks\tokenRefreshManager-DjnXhP__.js
    - C:\Web App\Agent IDE\out\main\index.js
    at resolveDbPath (...:25724:14)

[chatStateNewPath] crash recovery failed
  err: Cannot find module '../agentChat/threadStore'
    at runCrashRecovery (...:25912:61)

[chatStateNewPath] wireShadowTap failed
  err: Cannot find module './threadStore'
    at resolveDbPath (...:25724:14)
```

Effect: silent failure of chat-state crash recovery + registry rebuild + shadow tap at every startup that triggers the lazy code path. Threads load via fallback paths so users don't see immediate breakage, but recovery from a hard quit (where threads may not have been flushed) is broken.

## Root cause (diagnostician-confirmed 2026-05-17)

Wave 86 (commits `5ed34c67`, `68f8ba23`) introduced dynamic `require()` calls in three files to "keep tree-shaking clean":

| File | Line | Statement |
|---|---|---|
| `src/main/agentChat/chatOrchestrationSingletons.ts` | 44 | `require('./threadStore')` (lazy, inside `resolveDbPath`) |
| `src/main/ipc-handlers/chatStateNewPath.ts` | 93 | `require('../agentChat/threadStore')` |
| `src/main/session/sessionStartup.ts` | 36 | `require('../agentChat/threadStore')` |

These dynamic requires defeat rollup's import-resolution at build time. Rollup inlines `threadStore.ts` into the `tokenRefreshManager-*.js` chunk (because static imports of its exports exist elsewhere in the dep graph). But the dynamic `require()` strings are emitted verbatim and at runtime resolve relative to the emitted chunk's directory — where no sibling `threadStore.js` exists.

Tree-shaking is not a meaningful concern for an Electron main-process bundle. The dynamic-require trick guards against a non-problem.

## Verification of "pre-existing, not caused by B3b"

- Built commit `8a991f0c` (pre-B3b) in a separate worktree. Resulting `out/main/chunks/tokenRefreshManager-B9ldRour.js` has the same failing dynamic-require lines at lines 26716 and 26904.
- `git log --oneline 8a991f0c..HEAD -- src/main/agentChat/chatOrchestrationSingletons.ts src/main/agentChat/crashRecovery.ts` — empty. No changes to these files during B3a/B3b.
- Latency between Wave 86 and surfacing: the lazy code path doesn't fire on every startup; depends on DB / config state. First B3b user repro (00:08 ET) had a path that didn't trigger it; second (00:59 ET) did.

## Failed fix attempt (2026-05-17 01:15 ET)

Tried the obvious "convert dynamic require to static import" fix on all three files. **It broke ~33 tests across the agentChat subsystem.**

Why: importing ANY symbol from `threadStore.ts` triggers the module's top-level side effects — specifically the `agentChatThreadStore = createAgentChatThreadStore()` const at line 292 (only inside `isMainThread` branch, but vitest runs on main thread). `createAgentChatThreadStore()` opens SQLite via `getDefaultAgentChatThreadStoreDir()` → `app.getPath('userData')`. In test environments, electron's `app` is not fully initialized, so this fails with `Cannot read properties of undefined (reading 'getPath')` at module-load time, crashing the whole module's import.

The Wave 86 lazy-require pattern was explicitly guarding against this. The test escape hatch (`setDbPathForTest` in `chatOrchestrationSingletons.ts`) only works if `threadStore.ts` is never loaded — which the dynamic require ensures.

All three files were reverted to their pre-fix state. The startup errors remain.

## Recommended next-attempt fix shape

The fix needs to satisfy:
- Build correctness — the produced chunk must resolve `threadStore` at runtime (current state: it doesn't, because the dynamic require string isn't bundler-rewritten)
- Test correctness — module-load of the importing files must NOT trigger `threadStore.ts`'s top-level `createAgentChatThreadStore()` call
- Runtime correctness — actual lookup of `agentChatThreadStore` in production should still work

Two viable paths:

**Path A — Dynamic ES `import()` (the right answer)**

Replace `require('./threadStore')` with `await import('./threadStore')`. Rollup recognizes dynamic ES imports and emits chunk-aware lazy-load code (NOT a literal string require). Tests don't trigger module load until the dynamic import is actually called. Build resolves correctly.

Cost: callers (`resolveDbPath`, `runCrashRecovery`, `getThreadStore`) currently are synchronous. They'd need to become async. Their callers cascade similarly. This is a 1-2 day refactor across the chat subsystem — not a quick fix.

**Path B — `manualChunks` rule splitting threadStore into a stable named chunk**

Add a `rollupOptions.output.manualChunks` rule in `electron.vite.config.ts` that forces `src/main/agentChat/threadStore.ts` into a chunk with a stable predictable name (no hash). Then the runtime `require('./threadStore')` resolves correctly to the chunk file.

Cost: smaller; touches vite config only. But fragile — chunk naming conventions are vite/rollup-version-dependent. Also doesn't address the conceptual issue (dynamic require is a code smell for a tree-shaken bundle).

**Path C — Lazy initialization without import**

Refactor `threadStore.ts` so `agentChatThreadStore` is no longer initialized at module load. Make it a function or proxy that opens SQLite on first method call instead. Then static imports become safe.

Cost: medium; touches `threadStore.ts` and its callers. Cleanest long-term answer but the largest source surface.

Recommended path: **(C) lazy initialization in threadStore.ts**, because it removes the underlying foot-gun (module-load side effect) rather than working around it. (A) is correct but invasive. (B) papers over the issue.

## Constraints any future fix must respect

1. **`chatOrchestrationSingletons.test.ts` test escape hatches** — `setDbPathForTest` / `clearDbPathOverrideForTest` exist to let tests inject a db path without triggering threadStore's module load. Any fix must preserve this affordance.
2. **`isMainThread` guard in threadStore.ts** — the worker-thread proxy is load-bearing; codebase-graph indexing worker pulls this module transitively.
3. **All ~33 affected test files** load these modules at vitest collect time. They are NOT specifically testing threadStore — they're testing other things that import these modules in their dep chain.

## Verification after future fix

1. `npm run build` produces a `tokenRefreshManager-*.js` with no `require("./threadStore")` or `require("../agentChat/threadStore")` lines.
2. `npx vitest run src/main/agentChat/ src/main/ipc-handlers/ src/main/session/` shows zero new failures.
3. Next app startup shows zero `[chatStateNewPath]` error lines.

## Severity rationale

Medium — silent failure of crash-recovery + registry rebuild. Threads still load via fallback, so the user doesn't see immediate breakage, but recovery after a hard process crash is broken. The fix is small and mechanical.

## Why this is a bug, not a follow-up

User-observable error at every startup that triggers the lazy path. Real functional impact (crash recovery). Tight diagnosis and tight fix.
