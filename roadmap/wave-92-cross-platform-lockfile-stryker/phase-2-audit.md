---
status: COMPLETED
created: 2026-05-16
wave: 92
phase: 2
---

# Wave 92 Phase 2 — Native-Module Import Audit

## Summary

| Module | Plan expected | Actual sites | Status | Note |
|---|---|---|---|---|
| `better-sqlite3` | 1 | 24 (15 prod + 9 test) | EXPECTED-LEAK | Architecturally split across `storage/`, `codebaseGraph/`, `telemetry/`, `agentChat/`, `standalone/` per 300-line ESLint limit |
| `node-pty` | 1 | 8 (5 prod + 3 type-only) | EXPECTED-LEAK | PTY logic split: `pty.ts`, `ptyAgent.ts`, `ptySpawn.ts`, `claudeUsagePoller.ts`, `ptyHost/**` |
| `@parcel/watcher` | 1 | 1 | PASS | Matches plan |
| `@node-rs/xxhash` | 3 | 3 | PASS | All in `codebaseGraph/` as expected |

**Overall: PASS with revised mutate-exclusion list.** No code-quality leaks; all secondary sites are architectural decisions (forced by ESLint `max-lines: 300`, see `src/main/storage/CLAUDE.md` etc.). No refactor required. Wave 92 Decision 5 (`mutate: src/shared/**` only) still stands as the safest v1; the follow-up at `roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md` is updated below with the corrected boundary list.

## better-sqlite3 — 24 sites

**Regex:** `from ['"]better-sqlite3['"]|require\(['"]better-sqlite3['"]\)`

### Production (15)

- `src/main/storage/database.ts:12-13` — primary adapter (`openDatabase()`, WAL pragmas)
- `src/main/codebaseGraph/graphDatabase.ts:8`
- `src/main/codebaseGraph/graphDatabaseHelpers.ts:10` (type-only)
- `src/main/codebaseGraph/graphDatabaseMigrations.ts:13` (type-only)
- `src/main/codebaseGraph/graphDatabaseTraversal.ts:9` (type-only)
- `src/main/codebaseGraph/graphDatabaseSession.ts:10` (type-only)
- `src/main/telemetry/telemetryStore.ts:17` (type-only)
- `src/main/telemetry/telemetryStoreQueries.ts:8` (type-only)
- `src/main/telemetry/telemetryStoreHelpers.ts:8` (type-only)
- `src/main/telemetry/telemetryStoreWriters.ts:19` (type-only)
- `src/main/agentChat/threadStoreSqliteWriters.ts:8` (type-only)
- `src/standalone/ouroborosMcp/ouroborosMcpSchema.ts:15` (type-only)
- `src/standalone/ouroborosMcp/ouroborosMcp.ts:16`
- `tools/force-reindex.cjs:18` (build/maintenance)

### Test files (9)

Excluded from Stryker `mutate` by standard `!**/*.test.ts` pattern; non-issue.

`graphDatabaseMigrations.test.ts:9`, `chatPersistenceLayer.test.ts:24`, `threadStoreSqliteV10Migration.test.ts:26`, `walkingSkeleton.integration.test.ts:21`, `telemetryStoreWriters.test.ts:10`, `telemetryStoreQueries.test.ts:7`, `telemetryStoreHelpers.test.ts:5`, `telemetryStore.test.ts:10`, `importExtractor.test.ts:66` (string literal in test fixture).

## node-pty — 8 sites

**Regex:** `from ['"]node-pty['"]|require\(['"]node-pty['"]\)`

### Production (5 runtime + 3 type-only)

- `src/main/pty.ts:2` — primary orchestrator
- `src/main/ptyAgent.ts:7` (Claude agent PTY)
- `src/main/ptySpawn.ts:7` (shared spawn helpers)
- `src/main/claudeUsagePoller.ts:13` (session monitoring)
- `src/main/ptyHost/ptyHostMain.ts:13`
- `src/main/ptyShellReady.ts:13` (type-only)
- `src/main/ptyDisposables.ts:12` (type-only)
- `src/main/ptyHost/ptyHostShellReady.ts:8` (type-only)

## @parcel/watcher — 1 site

- `src/main/watchers/nativeWatcher.ts:10` — `import watcher from '@parcel/watcher'`

## @node-rs/xxhash — 3 sites

All in `src/main/codebaseGraph/`:

- `graphDatabaseSession.ts:9` — `import { xxh3 } from '@node-rs/xxhash'`
- `indexingPipelineSupport.ts:6` — `import { xxh3 } from '@node-rs/xxhash'`
- `mcpToolHandlerDefs.ts:6` — `import { xxh3 } from '@node-rs/xxhash'`

## Revised mutate-exclusion list

The original plan assumed each native module had ONE import site; in reality the storage and PTY subsystems are split across multiple files. For the **future** expansion wave (per `roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md`), the exclusion list grows from "3 single files" to **subsystem boundaries**:

```js
// Future expanded mutate config (NOT this wave — v1 stays src/shared/** only)
mutate: [
  'src/**/*.ts',
  '!src/**/*.test.ts',
  '!src/**/*.d.ts',
  // Native-module boundaries — Stryker sandbox can't rebuild native deps
  '!src/main/storage/**',         // better-sqlite3
  '!src/main/codebaseGraph/**',   // better-sqlite3 + xxhash
  '!src/main/telemetry/**',       // better-sqlite3
  '!src/main/agentChat/threadStoreSqlite*.ts',  // better-sqlite3
  '!src/main/pty*.ts',            // node-pty
  '!src/main/ptyHost/**',         // node-pty
  '!src/main/claudeUsagePoller.ts', // node-pty
  '!src/main/watchers/**',        // @parcel/watcher
  '!src/standalone/**',           // better-sqlite3 (standalone MCP server)
]
```

## Wave 92 implications

1. **Decision 5 unchanged:** v1 stays `mutate: src/shared/**/*.ts`. Tightest safest scope. Stryker baseline this wave is a partial measurement (intentional).
2. **Decision 8 unchanged:** `@node-rs/xxhash` retained. 3 sites in `codebaseGraph/` confirmed.
3. **Phase 8 vendor-gotcha `stryker-electron.md`:** must document the 4-module boundary list AND the subsystem-split pattern (not just per-file boundaries) as the discipline.
4. **No follow-ups filed for "leaks":** all secondary sites are intentional. The expansion-wave follow-up (`2026-05-16-stryker-mutate-scope-expansion.md`) gets updated with the corrected exclusion glob.

## Adapter-contract notes (for Phase 8 vendor-gotcha)

- **`better-sqlite3`** → `storage/database.ts` is the primary adapter (`openDatabase()`, WAL pragmas, busy timeout 5000ms). Subsystem schemas (graph, telemetry, threads) import `better-sqlite3` directly for type safety + DDL, not through a re-export. ESLint 300-line limit forced the split — not a refactor opportunity.
- **`node-pty`** → `pty.ts` is the central orchestrator. Domain-split files (`ptyAgent`, `ptyHost`, `ptySpawn`, `claudeUsagePoller`) import directly for type safety + clarity.
- **`@parcel/watcher`** → `watchers/nativeWatcher.ts` is the sole importer; backend selection (`fs` on Windows/macOS/Linux) lives here.
- **`@node-rs/xxhash`** → `xxh3()` used for content-hashing in the codebase-graph indexing pipeline (Wave 14). All 3 sites use the named import — bare-package grep MISSES these; named-import-aware regex is mandatory.
