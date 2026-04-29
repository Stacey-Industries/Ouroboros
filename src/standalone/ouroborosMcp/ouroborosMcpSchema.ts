/**
 * ouroborosMcpSchema.ts — Schema version handshake.
 *
 * The IDE writes the SQLite DB; the standalone reads it. If the IDE's
 * schema version doesn't match what this binary expects, we refuse to
 * serve rather than corrupt query results. Per Wave 60 ADR Decision —
 * version mismatch produces a clear error pointing at the IDE binary
 * version, not a silent broken response.
 *
 * The version is stored as SQLite `PRAGMA user_version` — set by the
 * IDE's GraphDatabase migration runner (`runMigrations` in
 * `src/main/codebaseGraph/graphDatabase.ts`).
 */

import type Database from 'better-sqlite3';

import { SCHEMA_VERSION } from '../../main/codebaseGraph/graphDatabaseSchema';

/**
 * Re-exported as `EXPECTED_SCHEMA_VERSION` so the standalone's intent is
 * obvious at call sites. Importing the IDE's `SCHEMA_VERSION` directly
 * means a schema bump in the IDE automatically reflects here — no
 * silent drift between the two.
 */
export const EXPECTED_SCHEMA_VERSION = SCHEMA_VERSION;

export interface SchemaCheckResult {
  ok: boolean;
  actualVersion: number;
  expectedVersion: number;
  message?: string;
}

export function checkSchemaVersion(db: Database.Database): SchemaCheckResult {
  const row = db.pragma('user_version', { simple: true }) as number | undefined;
  const actual = typeof row === 'number' ? row : 0;
  if (actual === EXPECTED_SCHEMA_VERSION) {
    return { ok: true, actualVersion: actual, expectedVersion: EXPECTED_SCHEMA_VERSION };
  }
  return {
    ok: false,
    actualVersion: actual,
    expectedVersion: EXPECTED_SCHEMA_VERSION,
    message: schemaMismatchMessage(actual, EXPECTED_SCHEMA_VERSION),
  };
}

function schemaMismatchMessage(actual: number, expected: number): string {
  if (actual === 0) {
    return (
      'Codebase graph not yet indexed. Open the Ouroboros IDE on a project at least ' +
      'once so it can build the graph; then rerun this MCP server.'
    );
  }
  if (actual < expected) {
    return (
      `Codebase graph schema is older than this binary expects (got v${actual}, ` +
      `need v${expected}). Update the Ouroboros IDE — it will migrate the DB on next launch.`
    );
  }
  return (
    `Codebase graph schema is newer than this binary supports (got v${actual}, ` +
    `expected v${expected}). The IDE has been updated past this standalone binary; ` +
    `update or reinstall this MCP server to match.`
  );
}
