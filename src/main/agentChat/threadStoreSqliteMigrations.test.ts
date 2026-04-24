/**
 * threadStoreSqliteMigrations.test.ts — Tests for idempotent column migrations.
 */

import { describe, expect, it } from 'vitest';

import type { Database } from '../storage/database';
import { applyColumnMigrations } from './threadStoreSqliteMigrations';

// ── Minimal DB stub ────────────────────────────────────────────────────────────

function makeDb(existingCols: { messages: string[]; threads: string[] }): {
  db: Database;
  executed: string[];
} {
  const executed: string[] = [];
  const db = {
    pragma(query: string) {
      if (query === 'table_info(messages)') {
        return existingCols.messages.map((name) => ({ name }));
      }
      if (query === 'table_info(threads)') {
        return existingCols.threads.map((name) => ({ name }));
      }
      return [];
    },
    exec(sql: string) {
      executed.push(sql.trim());
    },
  } as unknown as Database;
  return { db, executed };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('applyColumnMigrations', () => {
  it('adds model column when missing from messages', () => {
    const { db, executed } = makeDb({ messages: [], threads: [] });
    applyColumnMigrations(db, 0);
    expect(executed.some((s) => s.includes('ADD COLUMN model'))).toBe(true);
  });

  it('skips model column when already present', () => {
    const { db, executed } = makeDb({ messages: ['model'], threads: [] });
    applyColumnMigrations(db, 0);
    expect(executed.some((s) => s.includes('ADD COLUMN model'))).toBe(false);
  });

  it('adds checkpointCommit column when missing', () => {
    const { db, executed } = makeDb({ messages: [], threads: [] });
    applyColumnMigrations(db, 0);
    expect(executed.some((s) => s.includes('ADD COLUMN checkpointCommit'))).toBe(true);
  });

  it('adds tags column to threads when missing', () => {
    const { db, executed } = makeDb({ messages: [], threads: [] });
    applyColumnMigrations(db, 0);
    expect(executed.some((s) => s.includes('ADD COLUMN tags'))).toBe(true);
  });

  it('adds pinned and deletedAt to threads when missing (v5)', () => {
    const { db, executed } = makeDb({ messages: [], threads: [] });
    applyColumnMigrations(db, 0);
    expect(executed.some((s) => s.includes('ADD COLUMN pinned'))).toBe(true);
    expect(executed.some((s) => s.includes('ADD COLUMN deletedAt'))).toBe(true);
  });

  it('adds reactions and collapsedByDefault to messages when missing (v6)', () => {
    const { db, executed } = makeDb({ messages: [], threads: [] });
    applyColumnMigrations(db, 0);
    expect(executed.some((s) => s.includes('ADD COLUMN reactions'))).toBe(true);
    expect(executed.some((s) => s.includes('ADD COLUMN collapsedByDefault'))).toBe(true);
  });

  it('adds v8 branch columns to threads when missing', () => {
    const { db, executed } = makeDb({ messages: [], threads: [] });
    applyColumnMigrations(db, 0);
    expect(executed.some((s) => s.includes('ADD COLUMN branchName'))).toBe(true);
    expect(executed.some((s) => s.includes('ADD COLUMN forkOfMessageId'))).toBe(true);
    expect(executed.some((s) => s.includes('ADD COLUMN parentThreadId'))).toBe(true);
    expect(executed.some((s) => s.includes('ADD COLUMN isSideChat'))).toBe(true);
  });

  it('is idempotent — no exec calls when all columns already present', () => {
    const allMsgCols = [
      'id', 'threadId', 'role', 'content', 'createdAt',
      'model', 'checkpointCommit', 'reactions', 'collapsedByDefault',
    ];
    const allThdCols = [
      'id', 'workspaceRoot', 'tags', 'pinned', 'deletedAt',
      'branchName', 'forkOfMessageId', 'parentThreadId', 'isSideChat',
    ];
    const { db, executed } = makeDb({ messages: allMsgCols, threads: allThdCols });
    applyColumnMigrations(db, 8);
    expect(executed).toHaveLength(0);
  });

  it('ignores the _currentVersion parameter (runs all migrations regardless)', () => {
    // Even if passed version=8, it should still run when columns are absent
    const { db, executed } = makeDb({ messages: [], threads: [] });
    applyColumnMigrations(db, 8);
    expect(executed.length).toBeGreaterThan(0);
  });
});
