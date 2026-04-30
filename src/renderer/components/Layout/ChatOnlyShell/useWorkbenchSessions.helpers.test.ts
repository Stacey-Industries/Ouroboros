import { describe, expect, it } from 'vitest';

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';
import {
  buildCanonicalSessionIndex,
  buildThreadCounts,
  buildThreadIndex,
  compareSessionPriority,
  dedupeSessionsByProjectRoot,
  projectBasename,
  relativeTime,
  sessionStatus,
} from './useWorkbenchSessions.helpers';

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: overrides.id ?? 's1',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-04-22T14:00:00.000Z',
    projectRoot: '/proj/alpha',
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: 's1' },
    ...overrides,
  };
}

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 't1',
    workspaceRoot: '/proj/alpha',
    createdAt: 1,
    updatedAt: 10,
    title: 'thread',
    status: 'complete',
    messages: [],
    ...overrides,
  };
}

describe('projectBasename', () => {
  it('extracts the trailing path segment', () => {
    expect(projectBasename('/home/user/alpha-app')).toBe('alpha-app');
    expect(projectBasename('C:\\Users\\dev\\alpha')).toBe('alpha');
  });
});

describe('relativeTime', () => {
  it('formats sub-minute, minute, hour, and day spans', () => {
    const now = new Date('2026-04-22T14:00:00Z').getTime();
    expect(relativeTime('2026-04-22T13:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-04-22T13:50:00Z', now)).toBe('10m ago');
    expect(relativeTime('2026-04-22T11:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-04-20T14:00:00Z', now)).toBe('2d ago');
  });
});

describe('sessionStatus', () => {
  it('classifies active, archived, deleted', () => {
    expect(sessionStatus(makeSession())).toBe('active');
    expect(sessionStatus(makeSession({ archivedAt: '2026-04-22T00:00:00Z' }))).toBe('archived');
    expect(sessionStatus(makeSession({ deletedAt: '2026-04-22T00:00:00Z' }))).toBe('deleted');
  });
});

describe('compareSessionPriority + dedupeSessionsByProjectRoot', () => {
  it('keeps the higher-priority session per projectRoot (pinned > active > archived > deleted)', () => {
    const pinned = makeSession({ id: 'pinned', pinned: true });
    const archived = makeSession({ id: 'archived', archivedAt: '2026-04-22T00:00:00Z' });
    const result = dedupeSessionsByProjectRoot([archived, pinned]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('pinned');
  });

  it('compareSessionPriority sorts pinned ahead of unpinned', () => {
    const a = makeSession({ id: 'a', pinned: true });
    const b = makeSession({ id: 'b', pinned: false });
    expect(compareSessionPriority(a, b)).toBeLessThan(0);
  });
});

describe('buildCanonicalSessionIndex', () => {
  it('exposes byId for every session and canonicalByRoot for the deduped winners', () => {
    const a = makeSession({ id: 'a', projectRoot: '/proj/alpha' });
    const b = makeSession({ id: 'b', projectRoot: '/proj/alpha', pinned: true });
    const idx = buildCanonicalSessionIndex([a, b]);
    expect(idx.byId.size).toBe(2);
    expect(idx.canonicalByRoot.get('/proj/alpha')?.id).toBe('b');
  });
});

describe('buildThreadCounts', () => {
  it('counts threads per canonical session id', () => {
    const sessions = [makeSession({ id: 's1', projectRoot: '/proj/alpha' })];
    const threads = [
      makeThread({ id: 't1', workspaceRoot: '/proj/alpha' }),
      makeThread({ id: 't2', workspaceRoot: '/proj/alpha' }),
      makeThread({ id: 't3', workspaceRoot: '/proj/beta' }),
    ];
    const counts = buildThreadCounts(threads, sessions);
    expect(counts.get('s1')).toBe(2);
  });

  it('skips deleted threads', () => {
    const sessions = [makeSession()];
    const threads = [makeThread({ id: 't1', deletedAt: '2026-04-22T00:00:00Z' })];
    expect(buildThreadCounts(threads, sessions).get('s1')).toBeUndefined();
  });
});

describe('buildThreadIndex', () => {
  it('groups threads by sessionId and workspaceRoot, sorted desc by updatedAt', () => {
    const t1 = makeThread({
      id: 't1',
      updatedAt: 5,
      latestOrchestration: { sessionId: 's1' } as never,
    });
    const t2 = makeThread({
      id: 't2',
      updatedAt: 50,
      latestOrchestration: { sessionId: 's1' } as never,
    });
    const idx = buildThreadIndex([t1, t2], 't2');
    expect(idx.activeThread?.id).toBe('t2');
    expect(idx.bySessionId.get('s1')?.[0]?.id).toBe('t2');
    expect(idx.byWorkspaceRoot.get('/proj/alpha')?.[0]?.id).toBe('t2');
  });
});
