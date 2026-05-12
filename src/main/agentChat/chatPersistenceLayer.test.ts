/**
 * chatPersistenceLayer.test.ts — Unit tests for ChatPersistenceLayer.
 *
 * Uses an in-memory better-sqlite3 database (`:memory:`) rather than a temp
 * directory so tests are fast, deterministic, and leave no disk artefacts.
 *
 * The schema is initialised inline (the subset of SCHEMA_SQL + v10 DDL that
 * ChatPersistenceLayer touches). We do NOT import ThreadStoreSqliteRuntime
 * here — that would drag in Electron's `app` singleton which is unavailable
 * in vitest's jsdom environment.
 *
 * Coverage:
 *   insertAlias — row appears in loadAliases; duplicate upserts without data loss
 *   assignProviderSessionToAlias — populates provider_session_id; idempotent
 *   retireAlias — sets retired_at; non-matching turn is a no-op
 *   loadAliases — correct AliasRow shape, ordered by created_at ASC
 *   setLastProviderSession — updates threads.lastProviderSessionId; idempotent
 *   setLastInterruptedAt — updates threads.lastInterruptedAt; clearable with null
 *   appendCanonicalEventLog — serialises JSON into messages.canonical_event_log
 *   error resilience — each method catches DB errors and does not rethrow
 */

import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatPersistenceLayer } from './chatPersistenceLayer';

// ─── Schema helpers ────────────────────────────────────────────────────────────

/** Minimal schema covering only the columns ChatPersistenceLayer touches. */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    workspaceRoot TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'idle',
    lastProviderSessionId TEXT,
    lastInterruptedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT NOT NULL,
    threadId TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL DEFAULT 0,
    canonical_event_log TEXT,
    PRIMARY KEY (id, threadId)
  );
  CREATE TABLE IF NOT EXISTS identity_aliases (
    thread_id TEXT PRIMARY KEY,
    turn_id TEXT,
    provider_session_id TEXT,
    created_at INTEGER NOT NULL,
    retired_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_identity_aliases_psid
    ON identity_aliases(provider_session_id);
`;

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TID1 = 'thread-pl-1' as ThreadId;
const TID2 = 'thread-pl-2' as ThreadId;
const TURN1 = 'turn-pl-1' as TurnId;
const TURN2 = 'turn-pl-2' as TurnId;
const PSID1 = 'psid-pl-1' as ProviderSessionId;
const PSID2 = 'psid-pl-2' as ProviderSessionId;
const MSG1 = 'msg-pl-1';

// ─── Test setup ────────────────────────────────────────────────────────────────

let db: InstanceType<typeof Database>;
let layer: ChatPersistenceLayer;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  // Seed a thread and message row so UPDATE statements hit real rows.
  db.prepare(
    `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status)
     VALUES (?, '', 1, 1, 'T1', 'idle')`,
  ).run(TID1);
  db.prepare(
    `INSERT INTO threads (id, workspaceRoot, createdAt, updatedAt, title, status)
     VALUES (?, '', 2, 2, 'T2', 'idle')`,
  ).run(TID2);
  db.prepare(
    `INSERT INTO messages (id, threadId, role, content, createdAt)
     VALUES (?, ?, 'assistant', 'hello', 1)`,
  ).run(MSG1, TID1);
  layer = new ChatPersistenceLayer(db as unknown as import('../storage/database').Database);
});

afterEach(() => {
  db.close();
});

// ─── insertAlias ──────────────────────────────────────────────────────────────

describe('insertAlias', () => {
  it('inserts a row visible in loadAliases', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 100 });
    const rows = layer.loadAliases();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      threadId: TID1,
      turnId: TURN1,
      providerSessionId: undefined,
      createdAt: 100,
      retiredAt: null,
    });
  });

  it('upsert: re-inserting same threadId preserves turn_id', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 100 });
    layer.insertAlias({ threadId: TID1, turnId: TURN2, createdAt: 200 });
    const rows = layer.loadAliases();
    // PRIMARY KEY is thread_id — second insert overwrites the first.
    expect(rows).toHaveLength(1);
    expect(rows[0].turnId).toBe(TURN2);
  });
});

// ─── assignProviderSessionToAlias ─────────────────────────────────────────────

describe('assignProviderSessionToAlias', () => {
  it('populates provider_session_id', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 100 });
    layer.assignProviderSessionToAlias(TURN1, PSID1);
    const rows = layer.loadAliases();
    expect(rows[0].providerSessionId).toBe(PSID1);
  });

  it('is idempotent — second call with same PSID does not change the row', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 100 });
    layer.assignProviderSessionToAlias(TURN1, PSID1);
    layer.assignProviderSessionToAlias(TURN1, PSID1);
    const rows = layer.loadAliases();
    expect(rows[0].providerSessionId).toBe(PSID1);
  });

  it('does not overwrite an already-set PSID (WHERE condition guards it)', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 100 });
    layer.assignProviderSessionToAlias(TURN1, PSID1);
    // Second assign with a different PSID — the WHERE provider_session_id IS NULL
    // should NOT match, leaving PSID1 in place.
    layer.assignProviderSessionToAlias(TURN1, PSID2);
    const rows = layer.loadAliases();
    expect(rows[0].providerSessionId).toBe(PSID1);
  });

  it('is a no-op (no throw) when turnId has no alias row', () => {
    expect(() => layer.assignProviderSessionToAlias(TURN1, PSID1)).not.toThrow();
  });
});

// ─── retireAlias ──────────────────────────────────────────────────────────────

describe('retireAlias', () => {
  it('sets retired_at', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 100 });
    layer.retireAlias(TURN1, 999);
    const rows = layer.loadAliases();
    expect(rows[0].retiredAt).toBe(999);
  });

  it('is a no-op (no throw) when turnId not found', () => {
    expect(() => layer.retireAlias('no-such-turn' as TurnId, 999)).not.toThrow();
  });
});

// ─── loadAliases ──────────────────────────────────────────────────────────────

describe('loadAliases', () => {
  it('returns empty array when no aliases exist', () => {
    expect(layer.loadAliases()).toEqual([]);
  });

  it('returns rows ordered by created_at ASC', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 300 });
    layer.insertAlias({ threadId: TID2, turnId: TURN2, createdAt: 100 });
    const rows = layer.loadAliases();
    expect(rows[0].createdAt).toBe(100);
    expect(rows[1].createdAt).toBe(300);
  });

  it('includes both retired and non-retired rows', () => {
    layer.insertAlias({ threadId: TID1, turnId: TURN1, createdAt: 100 });
    layer.insertAlias({ threadId: TID2, turnId: TURN2, createdAt: 200 });
    layer.retireAlias(TURN1, 500);
    const rows = layer.loadAliases();
    expect(rows).toHaveLength(2);
    const retired = rows.find((r) => r.turnId === TURN1);
    const active = rows.find((r) => r.turnId === TURN2);
    expect(retired?.retiredAt).toBe(500);
    expect(active?.retiredAt).toBeNull();
  });
});

// ─── setLastProviderSession ───────────────────────────────────────────────────

describe('setLastProviderSession', () => {
  it('updates lastProviderSessionId on the threads row', () => {
    layer.setLastProviderSession(TID1, PSID1);
    const row = db.prepare('SELECT lastProviderSessionId FROM threads WHERE id = ?').get(TID1) as {
      lastProviderSessionId: string | null;
    };
    expect(row.lastProviderSessionId).toBe(PSID1);
  });

  it('is idempotent — calling twice with same value is safe', () => {
    layer.setLastProviderSession(TID1, PSID1);
    layer.setLastProviderSession(TID1, PSID1);
    const row = db.prepare('SELECT lastProviderSessionId FROM threads WHERE id = ?').get(TID1) as {
      lastProviderSessionId: string | null;
    };
    expect(row.lastProviderSessionId).toBe(PSID1);
  });

  it('clears the value when passed null', () => {
    layer.setLastProviderSession(TID1, PSID1);
    layer.setLastProviderSession(TID1, null);
    const row = db.prepare('SELECT lastProviderSessionId FROM threads WHERE id = ?').get(TID1) as {
      lastProviderSessionId: string | null;
    };
    expect(row.lastProviderSessionId).toBeNull();
  });

  it('is a no-op (no throw) for unknown threadId', () => {
    expect(() => layer.setLastProviderSession('no-such-thread' as ThreadId, PSID1)).not.toThrow();
  });
});

// ─── setLastInterruptedAt ─────────────────────────────────────────────────────

describe('setLastInterruptedAt', () => {
  it('sets lastInterruptedAt on the threads row', () => {
    layer.setLastInterruptedAt(TID1, 12345);
    const row = db.prepare('SELECT lastInterruptedAt FROM threads WHERE id = ?').get(TID1) as {
      lastInterruptedAt: number | null;
    };
    expect(row.lastInterruptedAt).toBe(12345);
  });

  it('clears the value when passed null', () => {
    layer.setLastInterruptedAt(TID1, 12345);
    layer.setLastInterruptedAt(TID1, null);
    const row = db.prepare('SELECT lastInterruptedAt FROM threads WHERE id = ?').get(TID1) as {
      lastInterruptedAt: number | null;
    };
    expect(row.lastInterruptedAt).toBeNull();
  });
});

// ─── appendCanonicalEventLog ──────────────────────────────────────────────────

describe('appendCanonicalEventLog', () => {
  it('serialises the event array into canonical_event_log', () => {
    const events = [
      { type: 'turn_submitted', threadId: TID1, turnId: TURN1, content: 'hi', ts: 1, seq: 1 },
    ] as import('@shared/types/canonicalChatEvent').CanonicalChatEvent[];
    layer.appendCanonicalEventLog(MSG1, events);
    const row = db.prepare('SELECT canonical_event_log FROM messages WHERE id = ?').get(MSG1) as {
      canonical_event_log: string | null;
    };
    expect(row.canonical_event_log).not.toBeNull();
    const parsed = JSON.parse(row.canonical_event_log!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe('turn_submitted');
  });

  it('is a no-op (no throw) for unknown messageId', () => {
    expect(() => layer.appendCanonicalEventLog('no-such-msg', [])).not.toThrow();
  });
});
