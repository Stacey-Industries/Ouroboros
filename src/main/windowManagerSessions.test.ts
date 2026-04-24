/**
 * windowManagerSessions.test.ts — Smoke tests for windowManagerSessions.ts.
 */

import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

vi.mock('./config', () => {
  const store: Record<string, unknown> = {};
  return {
    // eslint-disable-next-line security/detect-object-injection -- test store keys are controlled by session tests
    getConfigValue: (k: string) => store[k],
    // eslint-disable-next-line security/detect-object-injection -- test store keys are controlled by session tests
    setConfigValue: (k: string, v: unknown) => { store[k] = v; },
  };
});

vi.mock('./windowManagerHelpers', () => ({
  captureWindowBounds: () => ({ width: 1280, height: 800, isMaximized: false }),
  mergeBoundsIntoSessions: (sessions: unknown[]) => sessions,
  sessionsDataToWindowSessions: (data: unknown[]) =>
    data.map((s: unknown) => s as { projectRoots: string[] }),
  applyPersistedBounds: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import {
  persistWindowSessions,
  restoreWindowSessions,
  wireSessionHelpers,
} from './windowManagerSessions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFakeWin(destroyed = false): BrowserWindow {
  return {
    id: Math.floor(Math.random() * 10000),
    isDestroyed: () => destroyed,
    isMaximized: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
  } as unknown as BrowserWindow;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('wireSessionHelpers + persistWindowSessions', () => {
  beforeEach(() => {
    // Reset module-level state by re-wiring with fresh stubs each test
  });

  it('does nothing when no windows have a projectRoot', () => {
    wireSessionHelpers(
      () => [{ win: makeFakeWin(), projectRoot: null }],
      () => makeFakeWin(),
      () => undefined,
    );
    // Should not throw
    expect(() => persistWindowSessions()).not.toThrow();
  });

  it('does not throw when sessionsData is undefined', () => {
    wireSessionHelpers(
      () => [],
      () => makeFakeWin(),
      () => undefined,
    );
    expect(() => persistWindowSessions()).not.toThrow();
  });

  it('skips destroyed windows when building bounds map', () => {
    const destroyed = makeFakeWin(true);
    wireSessionHelpers(
      () => [{ win: destroyed, projectRoot: '/project' }],
      () => makeFakeWin(),
      () => undefined,
    );
    // byRoot.size === 0 → early return, no throw
    expect(() => persistWindowSessions()).not.toThrow();
  });
});

describe('restoreWindowSessions', () => {
  it('returns empty array when sessionsData is undefined', () => {
    wireSessionHelpers(
      () => [],
      () => makeFakeWin(),
      () => undefined,
    );
    const result = restoreWindowSessions();
    expect(result).toEqual([]);
  });

  it('returns empty array when source has no entries', async () => {
    const { setConfigValue } = await import('./config');
    setConfigValue('sessionsData' as never, [] as never);

    wireSessionHelpers(
      () => [],
      () => makeFakeWin(),
      () => undefined,
    );
    const result = restoreWindowSessions();
    expect(result).toEqual([]);
  });

  it('calls createWindow for each session with projectRoots', async () => {
    const { setConfigValue } = await import('./config');
    setConfigValue('sessionsData' as never, [
      { projectRoots: ['/project-a'], bounds: undefined },
    ] as never);

    const created: BrowserWindow[] = [];
    const fakeWin = makeFakeWin();
    wireSessionHelpers(
      () => [],
      () => {
        created.push(fakeWin);
        return fakeWin;
      },
      () => undefined,
    );

    const result = restoreWindowSessions();
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result)).toBe(true);
  });

  it('skips sessions without projectRoots', async () => {
    const { setConfigValue } = await import('./config');
    setConfigValue('sessionsData' as never, [
      { projectRoots: [], bounds: undefined },
    ] as never);

    let createCalled = false;
    wireSessionHelpers(
      () => [],
      () => { createCalled = true; return makeFakeWin(); },
      () => undefined,
    );

    restoreWindowSessions();
    expect(createCalled).toBe(false);
  });
});
