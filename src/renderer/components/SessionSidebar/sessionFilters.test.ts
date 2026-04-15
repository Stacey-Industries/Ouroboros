/**
 * sessionFilters.test.ts — Unit tests for applyFilters pure helper.
 */

import { describe, expect, it } from 'vitest';

import type { SessionRecord } from '../../types/electron';
import type { FilterState } from './sessionFilters';
import { applyFilters,DEFAULT_FILTER_STATE } from './sessionFilters';

// ─── Fixture factory ──────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: overrides.id ?? 'sess-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: new Date().toISOString(),
    projectRoot: overrides.projectRoot ?? '/projects/alpha',
    worktree: overrides.worktree ?? false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: overrides.id ?? 'sess-1' },
    ...overrides,
  };
}

function filters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTER_STATE, ...overrides };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('applyFilters — default (all)', () => {
  it('returns all sessions when all filters are at default', () => {
    const sessions = [makeSession(), makeSession({ id: 's2' })];
    expect(applyFilters(sessions, DEFAULT_FILTER_STATE)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(applyFilters([], DEFAULT_FILTER_STATE)).toEqual([]);
  });
});

describe('applyFilters — status filter', () => {
  const active = makeSession({ id: 'a' });
  const archived = makeSession({ id: 'b', archivedAt: '2026-01-01T00:00:00.000Z' });

  it('status:active returns only sessions without archivedAt', () => {
    const result = applyFilters([active, archived], filters({ status: 'active' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('status:archived returns only sessions with archivedAt', () => {
    const result = applyFilters([active, archived], filters({ status: 'archived' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('status:all returns both active and archived', () => {
    const result = applyFilters([active, archived], filters({ status: 'all' }));
    expect(result).toHaveLength(2);
  });

  it('status:queued returns empty (no sessions carry this state yet)', () => {
    const result = applyFilters([active, archived], filters({ status: 'queued' }));
    expect(result).toHaveLength(0);
  });

  it('status:errored returns empty (no sessions carry this state yet)', () => {
    const result = applyFilters([active, archived], filters({ status: 'errored' }));
    expect(result).toHaveLength(0);
  });
});

describe('applyFilters — project filter', () => {
  const alpha = makeSession({ id: 'p1', projectRoot: '/work/my-alpha-project' });
  const beta  = makeSession({ id: 'p2', projectRoot: '/work/beta' });

  it('empty project string matches all sessions', () => {
    expect(applyFilters([alpha, beta], filters({ project: '' }))).toHaveLength(2);
  });

  it('matches basename case-insensitively', () => {
    const result = applyFilters([alpha, beta], filters({ project: 'ALPHA' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('partial substring match works', () => {
    const result = applyFilters([alpha, beta], filters({ project: 'bet' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p2');
  });

  it('non-matching project string returns empty', () => {
    const result = applyFilters([alpha, beta], filters({ project: 'gamma' }));
    expect(result).toHaveLength(0);
  });

  it('whitespace-only project string matches all', () => {
    expect(applyFilters([alpha, beta], filters({ project: '   ' }))).toHaveLength(2);
  });
});

describe('applyFilters — worktree filter', () => {
  const plain    = makeSession({ id: 'w1', worktree: false });
  const worktree = makeSession({ id: 'w2', worktree: true });

  it('worktree:all returns both', () => {
    expect(applyFilters([plain, worktree], filters({ worktree: 'all' }))).toHaveLength(2);
  });

  it('worktree:worktree returns only sessions with worktree=true', () => {
    const result = applyFilters([plain, worktree], filters({ worktree: 'worktree' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('w2');
  });

  it('worktree:no-worktree returns only sessions with worktree=false', () => {
    const result = applyFilters([plain, worktree], filters({ worktree: 'no-worktree' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('w1');
  });
});

describe('applyFilters — AND composition', () => {
  const archWorktree = makeSession({
    id: 'aw', projectRoot: '/work/alpha', worktree: true,
    archivedAt: '2026-01-01T00:00:00.000Z',
  });
  const activeNoTree = makeSession({ id: 'an', projectRoot: '/work/alpha', worktree: false });
  const activeBeta   = makeSession({ id: 'ab', projectRoot: '/work/beta', worktree: false });

  it('status:archived AND worktree:worktree narrows correctly', () => {
    const result = applyFilters(
      [archWorktree, activeNoTree, activeBeta],
      filters({ status: 'archived', worktree: 'worktree' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('aw');
  });

  it('project + status filters together', () => {
    const result = applyFilters(
      [archWorktree, activeNoTree, activeBeta],
      filters({ status: 'active', project: 'alpha' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('an');
  });
});
