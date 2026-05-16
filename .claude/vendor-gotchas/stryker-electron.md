---
vendor: '@stryker-mutator + Electron native modules'
sdkVersion: '@stryker-mutator/core@9.6.1 + @stryker-mutator/vitest-runner@9.6.1 + Electron 41 + better-sqlite3@12, node-pty@1.2 beta, @parcel/watcher@2.5, @node-rs/xxhash@1.7'
firstWritten: 2026-05-16
lastVerified: 2026-05-16
relatedPaths:
  - stryker.config.mjs
  - roadmap/wave-92-cross-platform-lockfile-stryker/phase-2-audit.md
notes: 'How to scope Stryker mutate-globs in an Electron app where the sandbox cannot rebuild native modules.'
---

# Stryker + Electron native modules — mutate-glob discipline

Stryker's sandbox cannot rebuild native modules ([stryker-js#1621](https://github.com/stryker-mutator/stryker-js/issues/1621)). Any file in `mutate:` that transitively imports a native binding will fail the baseline run with `Could not locate the bindings file` or `MODULE_NOT_FOUND`. The fix is exclusion at the glob level, not refactoring the imports.

## The 4-module no-touch list (Agent IDE)

When configuring `mutate` in `stryker.config.mjs`, the following Agent IDE subsystems MUST be excluded — they directly import a native module:

| Module | Subsystem | Files |
|---|---|---|
| `better-sqlite3` | storage, codebaseGraph, telemetry, agentChat (schema/writers), standalone | 15 production files (split by 300-line ESLint cap) |
| `node-pty` | `pty.ts` + `ptyAgent`, `ptySpawn`, `ptyHost/`, `claudeUsagePoller` | 5 prod + 3 type-only |
| `@parcel/watcher` | `watchers/nativeWatcher.ts` | 1 |
| `@node-rs/xxhash` | `codebaseGraph/` (graphDatabaseSession, indexingPipelineSupport, mcpToolHandlerDefs) | 3 (xxh3 named import) |

Full audit at `roadmap/wave-92-cross-platform-lockfile-stryker/phase-2-audit.md`.

## Wave 92 v1 scope (canonical safe baseline)

```js
mutate: [
  'src/shared/**/*.ts',
  '!src/shared/**/*.test.ts',
  '!src/shared/**/*.d.ts',
],
```

`src/shared/**` has zero native-module imports (verified Phase 2). Baseline 22.41%, 174 mutants, 31 source files. Runs in 2m14s with 15 parallel workers.

## Future expansion (subsystem-boundary exclusion)

When ready to widen mutate-scope (per the open follow-up at `roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md`), do NOT widen file-by-file. Use subsystem-boundary exclusion:

```js
mutate: [
  'src/**/*.ts',
  '!src/**/*.test.ts',
  '!src/**/*.d.ts',
  '!src/main/storage/**',
  '!src/main/codebaseGraph/**',
  '!src/main/telemetry/**',
  '!src/main/agentChat/threadStoreSqlite*.ts',
  '!src/main/pty*.ts',
  '!src/main/ptyHost/**',
  '!src/main/claudeUsagePoller.ts',
  '!src/main/watchers/**',
  '!src/standalone/**',
],
```

Validate each glob change with `npx stryker run --dry-run` before committing — a `MODULE_NOT_FOUND` at dry-run is cheaper than a half-completed baseline.

## Two config options that turned out to be load-bearing

Wave 92 Phase 6 found these are not optional:

1. **`vitest: { configFile: 'vitest.config.ts' }`** — without this, Stryker spawns vitest without the project's environment routing and renderer tests fail with `React is not defined` (missing jsdom env). Wire the existing config explicitly.
2. **`testFiles: ['src/shared/**/*.test.ts']`** — restrict the test set to what can actually kill shared mutants. Without this, Stryker runs the FULL vitest suite (renderer + main, ~1000+ tests) for every mutation — glacial AND likely to hit env mismatches.

## node-abi EBADENGINE warning

When running `npm install` at Node 20.x: `node-abi@4.31.0` (transitive via `electron-builder`'s `app-builder-lib`) declares `engines.node >=22.12.0` and emits `EBADENGINE` warning. The dep installs and resolves correctly; warning is cosmetic. Don't chase it — the warning was present pre-wave and post-wave.
