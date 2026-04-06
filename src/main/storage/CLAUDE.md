<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
`PRAGMA user_version` is SQLite's built-in schema version slot — a single integer in the database header, zero table overhead, atomically updated with DDL. Using it instead of a `schema_migrations` table avoids the chicken-and-egg problem of needing a table before you can track whether tables exist.
`─────────────────────────────────────────────────`

# src/main/storage/ — SQLite database layer and JSON→SQLite migration

Shared `better-sqlite3` foundation plus one-time migration of three legacy JSON stores into SQLite. Must complete at startup before any store consumer opens its database.

## Key Files

| File               | Role |
| ------------------ | ---- |
| `database.ts`      | WAL-mode SQLite primitives: open, close, transaction wrapper, schema versioning via `PRAGMA user_version` |
| `migrate.ts`       | One-time JSON→SQLite migration for graph store, thread store, and cost history. Entry point: `runAllMigrations(projectRoot?)` |
| `database.test.ts` | Unit tests for `database.ts` primitives (WAL mode, busy timeout, directory auto-creation, transaction rollback) |

## Three Databases Managed Here

| Database          | Source JSON                            | Location                         |
| ----------------- | -------------------------------------- | -------------------------------- |
| `graph.db`        | `{projectRoot}/.ouroboros/graph.json`  | `{projectRoot}/.ouroboros/`      |
| `threads.db`      | `{userData}/agent-chat/threads/*.json` | `{userData}/agent-chat/threads/` |
| `cost-history.db` | `{userData}/cost-history.json`         | `{userData}/`                    |

## Patterns & Conventions

**Schema versioning** — every `ensureXxxSchema` function guards with `if (getSchemaVersion(db) >= 1) return;`, making DDL safe to call repeatedly. `setSchemaVersion` inlines the integer directly into the PRAGMA string — bound parameters are not supported for PRAGMAs.

**Non-destructive migrations** — source `.json` files are renamed to `.json.bak` on success, never deleted. Idempotency check: if `.bak` already exists the migration is skipped entirely.

**Fail-soft per store** — each migration has its own `try/catch/finally` with `closeDatabase` in `finally`. A failure in one store does not block the others.

**`metadata` columns** — nested objects are stored as `JSON.stringify`'d TEXT. Consumers must `JSON.parse` on read. Avoids schema churn as metadata shapes evolve.

**`INSERT OR REPLACE` vs `INSERT OR IGNORE`** — graph nodes use `OR REPLACE` (updates accepted on re-run), thread and cost rows use `OR IGNORE` (first write wins, idempotent re-runs).

**Standard WAL pragmas** — `openDatabase` always applies `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`. Never set these manually on a handle returned by this module.

## Startup Wiring

`runAllMigrations(projectRoot?)` is called from `src/main/main.ts` before `createWindow()`. Consumers (`threadStoreSqlite.ts`, `codebaseGraph/`, `usageReader.ts`) must not open their databases until this call returns.

## Gotchas

- **`projectRoot` is optional** — if omitted, `migrateGraphStore` is skipped silently. Pass it whenever the active project is known at startup.
- **`threads.db` lives *inside* the threads directory** (`userData/agent-chat/threads/threads.db`). The migration's `*.json` filter naturally excludes it since it lacks a `.json` extension.
- **Schema DDL lives in `migrate.ts`, not in consuming modules.** Downstream stores that add columns later must bump `user_version` themselves and issue `ALTER TABLE` — `migrate.ts` only runs once per install.
- **`edges.metadata` has no DEFAULT** — insertions must pass `null` explicitly for rows without metadata (see `insertGraphData`).
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# src/main/storage/ — SQLite database layer and JSON→SQLite migration

Provides a shared `better-sqlite3` foundation and one-time migration of three legacy JSON stores into SQLite databases. Called at app startup; must complete before any store consumers open their databases.

## Key Files

| File               | Role                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `database.ts`      | WAL-mode SQLite primitives: open, close, transaction wrapper, schema versioning via `PRAGMA user_version`                     |
| `migrate.ts`       | One-time JSON→SQLite migration for graph store, thread store, and cost history. Entry point: `runAllMigrations(projectRoot?)` |
| `database.test.ts` | Unit tests for `database.ts` primitives (WAL mode, busy timeout, directory auto-creation)                                     |

## Three Databases Managed Here

| Database          | Source JSON                 | Location                         |
| ----------------- | --------------------------- | -------------------------------- |
| `graph.db`        | `.ouroboros/graph.json`     | `{projectRoot}/.ouroboros/`      |
| `threads.db`      | `agent-chat/threads/*.json` | `{userData}/agent-chat/threads/` |
| `cost-history.db` | `cost-history.json`         | `{userData}/`                    |

## Patterns & Conventions

**Schema versioning** — every database uses `PRAGMA user_version` as a schema version counter. All `ensureXxxSchema` functions guard with `if (getSchemaVersion(db) >= 1) return;` so they're safe to call repeatedly without re-running DDL.

**Non-destructive migrations** — source `.json` files are renamed to `.json.bak` on success, never deleted. Idempotency check: if `.bak` already exists, the migration is skipped entirely.

**Fail-soft per store** — each migration has its own `try/catch`; a failure in one store doesn't block the others. `runAllMigrations` catches outer errors too.

**`metadata` columns** — complex nested objects are stored as `JSON.stringify`'d TEXT. Consumers must `JSON.parse` on read. This is by design: avoids schema churn as metadata shapes evolve.

**`INSERT OR REPLACE` vs `INSERT OR IGNORE`** — graph nodes use `OR REPLACE` (content updates accepted), thread/cost rows use `OR IGNORE` (idempotent re-runs, first write wins).

**WAL pragmas** — every `openDatabase` call sets `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`. Don't call these manually on a db handle opened via this module.

## Startup Wiring

`runAllMigrations(projectRoot?)` is called from `src/main/main.ts` early in app init — before thread store, graph store, or usage reader open their databases. Order matters: graph migration requires `projectRoot`, which is resolved from config before the call.

## Gotchas

- **`projectRoot` is optional in `runAllMigrations`** — if omitted, `migrateGraphStore` is skipped. Pass it when the active project is known at startup.
- **`threads.db` lives inside the threads directory** (`userData/agent-chat/threads/threads.db`) — not alongside it. The migration reads `*.json` from that same dir, so the db file itself is excluded by the `.json` filter.
- **Schema is defined inline in `migrate.ts`**, not in the consuming store modules. If `threadStoreSqlite.ts` or `codebaseGraph` add columns later, they must bump `user_version` and handle their own ALTER TABLE — `migrate.ts` only runs once.
- **`metadata` TEXT column in `edges` table has no default** — insertions must pass `null` explicitly for rows without metadata (see `insertGraphData`).
