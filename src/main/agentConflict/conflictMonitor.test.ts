/**
 * conflictMonitor.test.ts — Unit tests for ConflictMonitor.
 *
 * Tests symbol-overlap detection, file-only fallback when graph is cold,
 * debounce correctness, dismiss persistence + reset on new symbol,
 * and cross-root isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Stub logger ───────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Fake graph controller ─────────────────────────────────────────────────────
const mockDetectChangesForSession = vi.fn();
const mockGetStatus = vi.fn(() => ({ initialized: true }));

vi.mock('../codebaseGraph/graphController', () => ({
  getGraphControllerForRoot: vi.fn(() => ({
    getStatus: mockGetStatus,
    detectChangesForSession: mockDetectChangesForSession,
  })),
}));

import { ConflictMonitor, createConflictMonitor } from './conflictMonitor';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSymbol(file: string, name: string) {
  return { id: `${file}::${name}`, filePath: file, name, type: 'function', line: 1 };
}

describe('ConflictMonitor — file-only fallback', () => {
  let monitor: ConflictMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetStatus.mockReturnValue({ initialized: false });
    mockDetectChangesForSession.mockResolvedValue({
      changedFiles: [],
      affectedSymbols: [],
      blastRadius: 0,
    });
    monitor = createConflictMonitor();
  });

  afterEach(() => {
    monitor.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('emits warning-severity file-only conflict when graph is cold', async () => {
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root1', 'sessB', 'src/foo.ts');

    await vi.runAllTimersAsync();

    expect(snapshots.length).toBeGreaterThan(0);
    const snap = snapshots[snapshots.length - 1] as { reports: Array<{ fileOnly: boolean; severity: string }> };
    expect(snap.reports).toHaveLength(1);
    expect(snap.reports[0].fileOnly).toBe(true);
    expect(snap.reports[0].severity).toBe('warning');
  });

  it('no conflict when same session edits the same file', async () => {
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');

    await vi.runAllTimersAsync();

    const snap = snapshots[snapshots.length - 1] as { reports: unknown[] } | undefined;
    expect(snap?.reports ?? []).toHaveLength(0);
  });
});

describe('ConflictMonitor — symbol-level detection', () => {
  let monitor: ConflictMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetStatus.mockReturnValue({ initialized: true });
  });

  afterEach(() => {
    monitor.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('emits blocking conflict when both sessions edit the same function', async () => {
    mockDetectChangesForSession.mockResolvedValue({
      changedFiles: ['src/foo.ts'],
      affectedSymbols: [makeSymbol('src/foo.ts', 'fooBar')],
      blastRadius: 1,
    });

    monitor = createConflictMonitor();
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root1', 'sessB', 'src/foo.ts');

    await vi.runAllTimersAsync();

    const snap = snapshots[snapshots.length - 1] as { reports: Array<{ severity: string; fileOnly: boolean }> };
    expect(snap.reports).toHaveLength(1);
    expect(snap.reports[0].severity).toBe('blocking');
    expect(snap.reports[0].fileOnly).toBe(false);
  });

  it('emits info when same file but no symbol overlap', async () => {
    mockDetectChangesForSession
      .mockResolvedValueOnce({
        changedFiles: ['src/foo.ts'],
        affectedSymbols: [makeSymbol('src/foo.ts', 'funcA')],
        blastRadius: 1,
      })
      .mockResolvedValueOnce({
        changedFiles: ['src/foo.ts'],
        affectedSymbols: [makeSymbol('src/foo.ts', 'funcB')],
        blastRadius: 1,
      });

    monitor = createConflictMonitor();
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root1', 'sessB', 'src/foo.ts');

    await vi.runAllTimersAsync();

    const snap = snapshots[snapshots.length - 1] as { reports: Array<{ severity: string }> };
    expect(snap.reports).toHaveLength(1);
    expect(snap.reports[0].severity).toBe('info');
  });
});

describe('ConflictMonitor — cross-root isolation', () => {
  let monitor: ConflictMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetStatus.mockReturnValue({ initialized: false });
    mockDetectChangesForSession.mockResolvedValue({
      changedFiles: [],
      affectedSymbols: [],
      blastRadius: 0,
    });
    monitor = createConflictMonitor();
  });

  afterEach(() => {
    monitor.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not report conflict across different project roots', async () => {
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root2', 'sessB', 'src/foo.ts');

    await vi.runAllTimersAsync();

    const snap = snapshots[snapshots.length - 1] as { reports: unknown[] } | undefined;
    expect(snap?.reports ?? []).toHaveLength(0);
  });
});

describe('ConflictMonitor — dismiss', () => {
  let monitor: ConflictMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGetStatus.mockReturnValue({ initialized: false });
    mockDetectChangesForSession.mockResolvedValue({
      changedFiles: [],
      affectedSymbols: [],
      blastRadius: 0,
    });
    monitor = createConflictMonitor();
  });

  afterEach(() => {
    monitor.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('suppresses reports after dismiss', async () => {
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root1', 'sessB', 'src/foo.ts');
    await vi.runAllTimersAsync();

    monitor.dismiss('sessA', 'sessB');

    snapshots.length = 0;
    monitor.recordEdit('root1', 'sessA', 'src/bar.ts');
    await vi.runAllTimersAsync();

    const snap = snapshots[snapshots.length - 1] as { reports: unknown[] } | undefined;
    expect(snap?.reports ?? []).toHaveLength(0);
  });

  it('re-shows report when a new overlapping file is touched after dismiss', async () => {
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root1', 'sessB', 'src/foo.ts');
    await vi.runAllTimersAsync();

    monitor.dismiss('sessA', 'sessB');

    // Touch a NEW file that overlaps with sessB
    monitor.recordEdit('root1', 'sessA', 'src/baz.ts');
    monitor.recordEdit('root1', 'sessB', 'src/baz.ts');
    await vi.runAllTimersAsync();

    const snap = snapshots[snapshots.length - 1] as { reports: unknown[] };
    // Dismiss should be cleared because both sides touched a new overlapping file
    expect(snap.reports.length).toBeGreaterThan(0);
  });
});

describe('ConflictMonitor — debounce', () => {
  it('does not fire before debounce window elapses', async () => {
    vi.useFakeTimers();
    mockGetStatus.mockReturnValue({ initialized: false });
    mockDetectChangesForSession.mockResolvedValue({
      changedFiles: [],
      affectedSymbols: [],
      blastRadius: 0,
    });

    const monitor = createConflictMonitor();
    const snapshots: unknown[] = [];
    monitor.on('snapshot', (s) => snapshots.push(s));

    monitor.recordEdit('root1', 'sessA', 'src/foo.ts');
    monitor.recordEdit('root1', 'sessB', 'src/foo.ts');

    // Advance only 100ms — still within 200ms debounce
    await vi.advanceTimersByTimeAsync(100);
    expect(snapshots).toHaveLength(0);

    // Now advance past the debounce
    await vi.advanceTimersByTimeAsync(200);
    expect(snapshots.length).toBeGreaterThan(0);

    monitor.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
});
