/**
 * threadStoreSqliteWriters.test.ts — Smoke tests for SQL write helpers.
 */

import { describe, expect, it } from 'vitest';

import type { Database } from '../storage/database';
import { prepareInsertMessage, runInsertMessage, upsertThreadRow } from './threadStoreSqliteWriters';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Minimal stubs ──────────────────────────────────────────────────────────────

function makeDb(): { db: Database; ranSql: string[]; ranParams: unknown[][] } {
  const ranSql: string[] = [];
  const ranParams: unknown[][] = [];
  const stmt = {
    run: (...params: unknown[]) => { ranParams.push(params); return { changes: 1 }; },
  };
  const db = {
    prepare: (sql: string) => { ranSql.push(sql.trim().slice(0, 40)); return stmt; },
  } as unknown as Database;
  return { db, ranSql, ranParams };
}

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/project',
    createdAt: 1000,
    updatedAt: 2000,
    title: 'Test thread',
    status: 'idle',
    messages: [],
    ...overrides,
  } as AgentChatThreadRecord;
}

function makeMessage(overrides: Partial<AgentChatMessageRecord> = {}): AgentChatMessageRecord {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    role: 'user',
    content: 'hello',
    createdAt: 1000,
    ...overrides,
  };
}

// ── upsertThreadRow ────────────────────────────────────────────────────────────

describe('upsertThreadRow', () => {
  it('calls db.prepare with INSERT INTO threads SQL', () => {
    const { db, ranSql } = makeDb();
    upsertThreadRow(db, makeThread());
    expect(ranSql[0]).toMatch(/INSERT INTO threads/i);
  });

  it('passes 15 positional params (columns)', () => {
    const { db, ranParams } = makeDb();
    upsertThreadRow(db, makeThread());
    expect(ranParams[0]).toHaveLength(15);
  });

  it('encodes latestOrchestration as JSON string when present', () => {
    const { db, ranParams } = makeDb();
    const orch = { taskId: 'task-1', sessionId: 'sess-1' };
    upsertThreadRow(db, makeThread({ latestOrchestration: orch as never }));
    // latestOrchestration is param index 6
    expect(ranParams[0][6]).toBe(JSON.stringify(orch));
  });

  it('passes null for latestOrchestration when absent', () => {
    const { db, ranParams } = makeDb();
    upsertThreadRow(db, makeThread({ latestOrchestration: undefined }));
    expect(ranParams[0][6]).toBeNull();
  });

  it('encodes pinned as 1 when true', () => {
    const { db, ranParams } = makeDb();
    upsertThreadRow(db, makeThread({ pinned: true }));
    // pinned is param index 9
    expect(ranParams[0][9]).toBe(1);
  });

  it('encodes pinned as 0 when false/absent', () => {
    const { db, ranParams } = makeDb();
    upsertThreadRow(db, makeThread({ pinned: false }));
    expect(ranParams[0][9]).toBe(0);
  });
});

// ── prepareInsertMessage ───────────────────────────────────────────────────────

describe('prepareInsertMessage', () => {
  it('calls db.prepare with INSERT OR REPLACE INTO messages SQL', () => {
    const { db, ranSql } = makeDb();
    prepareInsertMessage(db);
    expect(ranSql[0]).toMatch(/INSERT OR REPLACE INTO messages/i);
  });

  it('returns the statement object', () => {
    const { db } = makeDb();
    const stmt = prepareInsertMessage(db);
    expect(stmt).toBeDefined();
    expect(typeof stmt.run).toBe('function');
  });
});

// ── runInsertMessage ───────────────────────────────────────────────────────────

describe('runInsertMessage', () => {
  it('calls stmt.run with 19 params', () => {
    const ranParams: unknown[][] = [];
    const stmt = { run: (...p: unknown[]) => { ranParams.push(p); } } as never;
    runInsertMessage(stmt, 'thread-1', makeMessage());
    expect(ranParams[0]).toHaveLength(19);
  });

  it('passes message id, threadId, role, content, createdAt as first params', () => {
    const ranParams: unknown[][] = [];
    const stmt = { run: (...p: unknown[]) => { ranParams.push(p); } } as never;
    const msg = makeMessage();
    runInsertMessage(stmt, 'thread-1', msg);
    const [id, tid, role, content, createdAt] = ranParams[0] as unknown[];
    expect(id).toBe('msg-1');
    expect(tid).toBe('thread-1');
    expect(role).toBe('user');
    expect(content).toBe('hello');
    expect(createdAt).toBe(1000);
  });

  it('JSON-encodes orchestration when present', () => {
    const ranParams: unknown[][] = [];
    const stmt = { run: (...p: unknown[]) => { ranParams.push(p); } } as never;
    const orch = { taskId: 't1' };
    runInsertMessage(stmt, 'thread-1', makeMessage({ orchestration: orch as never }));
    // orchestration is param index 6
    expect(ranParams[0][6]).toBe(JSON.stringify(orch));
  });

  it('passes null for orchestration when absent', () => {
    const ranParams: unknown[][] = [];
    const stmt = { run: (...p: unknown[]) => { ranParams.push(p); } } as never;
    runInsertMessage(stmt, 'thread-1', makeMessage());
    expect(ranParams[0][6]).toBeNull();
  });

  it('encodes collapsedByDefault as 1 when true', () => {
    const ranParams: unknown[][] = [];
    const stmt = { run: (...p: unknown[]) => { ranParams.push(p); } } as never;
    runInsertMessage(stmt, 'thread-1', makeMessage({ collapsedByDefault: true }));
    // collapsedByDefault is last param (index 18)
    expect(ranParams[0][18]).toBe(1);
  });
});
