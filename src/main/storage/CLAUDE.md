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
