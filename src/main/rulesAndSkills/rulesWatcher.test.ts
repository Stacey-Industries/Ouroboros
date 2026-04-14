/**
 * rulesWatcher.test.ts — Unit tests for the chokidar→@parcel/watcher migration.
 *
 * Acceptance criteria:
 *   1. .md file additions in a watched dir trigger onChange after debounce
 *   2. Non-.md file additions do NOT trigger onChange
 *   3. CLAUDE.md or AGENTS.md modification triggers onChange
 *   4. Cleanup function awaits all subscriptions and closes all fs.watch handles
 *
 * Run with: npx vitest run src/main/rulesAndSkills/rulesWatcher
 */

import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks must be declared before any import of the module under test ─────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Capture the onEvent callback passed to watchRecursive so tests can invoke it.
const { mockWatchRecursive, mockSubscriptionClose } = vi.hoisted(() => {
  const mockSubscriptionClose = vi.fn().mockResolvedValue(undefined);
  const mockWatchRecursive = vi.fn();
  return { mockWatchRecursive, mockSubscriptionClose };
});

vi.mock('../watchers', () => ({
  watchRecursive: mockWatchRecursive,
}));

// Capture fs.watch calls so tests can fire events and check cleanup.
const { mockFsWatch, mockFsWatcherClose } = vi.hoisted(() => {
  const mockFsWatcherClose = vi.fn();
  const mockFsWatch = vi.fn();
  return { mockFsWatch, mockFsWatcherClose };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      watch: mockFsWatch,
    },
  };
});

// ── Import module under test after mocks ──────────────────────────────────────
import os from 'os';

import { startRulesWatcher } from './rulesWatcher';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT =
  process.platform === 'win32' ? 'C:\\projects\\myapp' : '/projects/myapp';

/** Flush all pending microtasks (resolved promises). */
async function flushMicrotasks(): Promise<void> {
  // Multiple ticks to drain chained .then() calls inside the module
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Advance fake timers past the 1-second debounce. */
function flushDebounce(): void {
  vi.advanceTimersByTime(1100);
}

/** Return the onEvent callback registered by the nth watchRecursive call. */
function getDirEventCallback(callIndex = 0): (event: { type: string; path: string }) => void {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into vitest mock.calls array
  const call = mockWatchRecursive.mock.calls[callIndex];
  if (!call) throw new Error(`watchRecursive call ${callIndex} not found`);
  return call[2] as (event: { type: string; path: string }) => void;
}

/** Return the path argument passed to the nth fs.watch call. */
function getFsWatchPath(callIndex = 0): string {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into vitest mock.calls array
  const call = mockFsWatch.mock.calls[callIndex];
  if (!call) throw new Error(`fs.watch call ${callIndex} not found`);
  return call[0] as string;
}

/** Return the handler registered by the nth fs.watch call. */
function getFsWatchHandler(callIndex = 0): () => void {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into vitest mock.calls array
  const call = mockFsWatch.mock.calls[callIndex];
  if (!call) throw new Error(`fs.watch call ${callIndex} not found`);
  return call[1] as () => void;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();

  mockWatchRecursive.mockResolvedValue({ close: mockSubscriptionClose });
  mockFsWatch.mockReturnValue({ close: mockFsWatcherClose });
  mockSubscriptionClose.mockResolvedValue(undefined);
  mockFsWatcherClose.mockReset();

  vi.spyOn(os, 'homedir').mockReturnValue(
    process.platform === 'win32' ? 'C:\\Users\\tester' : '/home/tester',
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  mockWatchRecursive.mockReset();
  mockFsWatch.mockReset();
  mockSubscriptionClose.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('startRulesWatcher()', () => {
  describe('directory watching — .md filter', () => {
    it('triggers onChange after debounce when a .md file is added to a watched dir', async () => {
      const onChange = vi.fn();
      startRulesWatcher(PROJECT_ROOT, onChange);
      await flushMicrotasks();

      const onEvent = getDirEventCallback(0);
      onEvent({ type: 'create', path: path.join(PROJECT_ROOT, '.claude', 'commands', 'foo.md') });

      expect(onChange).not.toHaveBeenCalled();
      flushDebounce();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger onChange for non-.md file changes in a watched dir', async () => {
      const onChange = vi.fn();
      startRulesWatcher(PROJECT_ROOT, onChange);
      await flushMicrotasks();

      const onEvent = getDirEventCallback(0);
      onEvent({ type: 'create', path: path.join(PROJECT_ROOT, '.claude', 'commands', 'script.sh') });
      onEvent({ type: 'update', path: path.join(PROJECT_ROOT, '.claude', 'rules', 'note.txt') });

      flushDebounce();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('debounces multiple rapid .md events into a single onChange call', async () => {
      const onChange = vi.fn();
      startRulesWatcher(PROJECT_ROOT, onChange);
      await flushMicrotasks();

      const onEvent = getDirEventCallback(0);
      onEvent({ type: 'create', path: path.join(PROJECT_ROOT, '.claude', 'commands', 'a.md') });
      onEvent({ type: 'update', path: path.join(PROJECT_ROOT, '.claude', 'commands', 'b.md') });
      onEvent({ type: 'delete', path: path.join(PROJECT_ROOT, '.claude', 'rules', 'c.md') });

      flushDebounce();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('watches all four md directories', async () => {
      startRulesWatcher(PROJECT_ROOT, vi.fn());
      await flushMicrotasks();

      // 4 directories: project commands, project rules, home commands, home rules
      expect(mockWatchRecursive).toHaveBeenCalledTimes(4);
    });
  });

  describe('single-file watching (CLAUDE.md, AGENTS.md)', () => {
    it('triggers onChange after debounce when CLAUDE.md is modified', async () => {
      const onChange = vi.fn();
      startRulesWatcher(PROJECT_ROOT, onChange);
      await flushMicrotasks();

      // CLAUDE.md is always watched first
      const claudePath = getFsWatchPath(0);
      expect(claudePath).toMatch(/CLAUDE\.md$/);

      const claudeHandler = getFsWatchHandler(0);
      claudeHandler();

      expect(onChange).not.toHaveBeenCalled();
      flushDebounce();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('triggers onChange after debounce when AGENTS.md is modified', async () => {
      const onChange = vi.fn();
      startRulesWatcher(PROJECT_ROOT, onChange);
      await flushMicrotasks();

      const agentsPath = getFsWatchPath(1);
      expect(agentsPath).toMatch(/AGENTS\.md$/);

      const agentsHandler = getFsWatchHandler(1);
      agentsHandler();

      flushDebounce();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('watches CLAUDE.md and AGENTS.md at the project root', () => {
      startRulesWatcher(PROJECT_ROOT, vi.fn());

      const watchedPaths = mockFsWatch.mock.calls.map((c) => c[0] as string);
      expect(watchedPaths).toContain(path.join(PROJECT_ROOT, 'CLAUDE.md'));
      expect(watchedPaths).toContain(path.join(PROJECT_ROOT, 'AGENTS.md'));
    });

    it('skips ENOENT silently when CLAUDE.md does not exist', async () => {
      mockFsWatch
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
        })
        .mockReturnValueOnce({ close: mockFsWatcherClose });

      const onChange = vi.fn();
      expect(() => startRulesWatcher(PROJECT_ROOT, onChange)).not.toThrow();
      await flushMicrotasks();

      // AGENTS.md handler (index 1 of mock calls, but only 1 succeeded)
      // The second fs.watch call is AGENTS.md
      const agentsHandler = getFsWatchHandler(1);
      agentsHandler();
      flushDebounce();
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup function', () => {
    it('calls close() on all watchRecursive subscriptions', async () => {
      const stop = startRulesWatcher(PROJECT_ROOT, vi.fn());
      await flushMicrotasks();

      stop();
      await flushMicrotasks();

      expect(mockSubscriptionClose).toHaveBeenCalledTimes(4);
    });

    it('calls close() on all fs.watch handles', async () => {
      const stop = startRulesWatcher(PROJECT_ROOT, vi.fn());
      await flushMicrotasks();

      stop();

      // Both fs.watch handles (CLAUDE.md + AGENTS.md) should be closed
      expect(mockFsWatcherClose).toHaveBeenCalledTimes(2);
    });

    it('does not throw when an fs.watch handle was null (file missing at start)', async () => {
      mockFsWatch.mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const stop = startRulesWatcher(PROJECT_ROOT, vi.fn());
      await flushMicrotasks();

      expect(() => stop()).not.toThrow();
    });
  });

  describe('missing directories (skip silently)', () => {
    it('skips a directory that does not exist (ENOENT from watchRecursive)', async () => {
      mockWatchRecursive
        .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
        .mockResolvedValue({ close: mockSubscriptionClose });

      const onChange = vi.fn();
      startRulesWatcher(PROJECT_ROOT, onChange);
      await flushMicrotasks();

      // Remaining dirs (index 1 onwards) still trigger onChange
      const onEvent = getDirEventCallback(1);
      onEvent({ type: 'create', path: path.join(PROJECT_ROOT, '.claude', 'rules', 'new.md') });
      flushDebounce();
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });
});

// ── Verify no chokidar import survives in the source ──────────────────────────
describe('chokidar removal', () => {
  it('does not import chokidar', async () => {
    const { readFileSync } = await import('fs');
    // __dirname is the directory of this test file — rulesWatcher.ts is a sibling
    const srcPath = path.join(__dirname, 'rulesWatcher.ts');
    const src = readFileSync(srcPath, 'utf8');
    expect(src).not.toMatch(/chokidar/);
  });
});
