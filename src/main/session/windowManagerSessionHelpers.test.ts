/**
 * windowManagerSessionHelpers.test.ts — Unit tests for session-aware window helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from './session';
import { makeSession } from './session';
import type { SessionStore } from './sessionStore';
import {
  buildWorktreeCwd,
  clearWindowActiveSession,
  getProjectRootForWindow,
  getProjectRootsForWindow,
  getSessionForWindow,
  resolveActiveSessionCwd,
  setWindowActiveSession,
} from './windowManagerSessionHelpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let mockStore: SessionStore | null = null;

function makeTestSession(projectRoot: string, overrides?: Partial<Session>): Session {
  return { ...makeSession(projectRoot), ...overrides };
}

function makeStore(partial: Partial<SessionStore>): SessionStore {
  return {
    getById: () => undefined,
    listAll: () => [],
    listByProjectRoot: () => [],
    listActive: () => [],
    upsert: () => undefined,
    archive: () => undefined,
    delete: () => undefined,
    pin: () => undefined,
    softDelete: () => undefined,
    restoreDeleted: () => undefined,
    ...partial,
  };
}

// ─── Mock sessionStore module ─────────────────────────────────────────────────

vi.mock('./sessionStore', () => ({
  getSessionStore: () => mockStore,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('windowManagerSessionHelpers', () => {
  beforeEach(() => {
    // Reset state between tests
    clearWindowActiveSession(1);
    clearWindowActiveSession(2);
    mockStore = null;
  });

  afterEach(() => {
    clearWindowActiveSession(1);
    clearWindowActiveSession(2);
  });

  // ── getSessionForWindow ───────────────────────────────────────────────────

  describe('getSessionForWindow', () => {
    it('returns null when no session is registered for the window', () => {
      expect(getSessionForWindow(99)).toBeNull();
    });

    it('returns null when store is not initialised', () => {
      mockStore = null;
      setWindowActiveSession(1, 'some-session-id');
      expect(getSessionForWindow(1)).toBeNull();
    });

    it('returns the session when store has a matching record', () => {
      const session = makeTestSession('/projects/app');
      mockStore = makeStore({
        getById: (id) => (id === session.id ? session : undefined),
        listAll: () => [session],
      });
      setWindowActiveSession(1, session.id);
      expect(getSessionForWindow(1)).toEqual(session);
    });

    it('returns null when session id is not found in store', () => {
      mockStore = makeStore({});
      setWindowActiveSession(1, 'ghost-session-id');
      expect(getSessionForWindow(1)).toBeNull();
    });
  });

  // ── buildWorktreeCwd ──────────────────────────────────────────────────────

  describe('buildWorktreeCwd', () => {
    it('returns projectRoot when worktree is false', () => {
      const session = makeTestSession('/projects/app', { worktree: false });
      expect(buildWorktreeCwd(session)).toBe('/projects/app');
    });

    it('returns projectRoot when worktree is true but worktreePath is absent', () => {
      const session = makeTestSession('/projects/app', { worktree: true, worktreePath: undefined });
      expect(buildWorktreeCwd(session)).toBe('/projects/app');
    });

    it('returns worktreePath when worktree is true and worktreePath is set', () => {
      const session = makeTestSession('/projects/app', {
        worktree: true,
        worktreePath: '/tmp/wt/session-123',
      });
      expect(buildWorktreeCwd(session)).toBe('/tmp/wt/session-123');
    });
  });

  // ── getProjectRootForWindow / getProjectRootsForWindow ────────────────────

  describe('getProjectRootForWindow', () => {
    it('returns null when no session is registered', () => {
      expect(getProjectRootForWindow(42)).toBeNull();
    });

    it('returns projectRoot from the active session', () => {
      const session = makeTestSession('/projects/app');
      mockStore = makeStore({ getById: (id) => (id === session.id ? session : undefined) });
      setWindowActiveSession(2, session.id);
      expect(getProjectRootForWindow(2)).toBe('/projects/app');
    });
  });

  describe('getProjectRootsForWindow', () => {
    it('returns empty array when no session is registered', () => {
      expect(getProjectRootsForWindow(42)).toEqual([]);
    });

    it('returns [projectRoot] from the active session', () => {
      const session = makeTestSession('/projects/app');
      mockStore = makeStore({ getById: (id) => (id === session.id ? session : undefined) });
      setWindowActiveSession(2, session.id);
      expect(getProjectRootsForWindow(2)).toEqual(['/projects/app']);
    });
  });

  // ── resolveActiveSessionCwd ───────────────────────────────────────────────

  describe('resolveActiveSessionCwd', () => {
    it('returns null when no session is registered', () => {
      expect(resolveActiveSessionCwd(99)).toBeNull();
    });

    it('returns projectRoot for a non-worktree session', () => {
      const session = makeTestSession('/projects/app', { worktree: false });
      mockStore = makeStore({ getById: (id) => (id === session.id ? session : undefined) });
      setWindowActiveSession(1, session.id);
      expect(resolveActiveSessionCwd(1)).toBe('/projects/app');
    });

    it('returns worktreePath for an active worktree session', () => {
      const session = makeTestSession('/projects/app', {
        worktree: true,
        worktreePath: '/tmp/wt/session-abc',
      });
      mockStore = makeStore({ getById: (id) => (id === session.id ? session : undefined) });
      setWindowActiveSession(1, session.id);
      expect(resolveActiveSessionCwd(1)).toBe('/tmp/wt/session-abc');
    });
  });
});
