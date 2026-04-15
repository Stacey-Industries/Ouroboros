/**
 * conflictMonitorSupport.test.ts — Unit tests for pure helpers in conflictMonitorSupport.ts.
 */

import { describe, expect, it, vi } from 'vitest';

// ── Stub logger ───────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Stub graph controller ─────────────────────────────────────────────────────
const mockDetectChangesForSession = vi.fn();
const mockGetStatus = vi.fn(() => ({ initialized: true }));

vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphControllerForRoot: vi.fn(() => ({
    getStatus: mockGetStatus,
    detectChangesForSession: mockDetectChangesForSession,
  })),
}));

import type { RootSessionMap } from './conflictMonitorSupport';
import {
  buildOverlapSymbols,
  computeSymbols,
  extractSessionId,
  getOrCreateEntry,
  getSessionsForRoot,
  isGraphHot,
  pairKey,
  rootSessionKey,
  severityForSymbols,
  shouldClearDismiss,
} from './conflictMonitorSupport';

// ── Key helpers ───────────────────────────────────────────────────────────────

describe('rootSessionKey', () => {
  it('concatenates root and session with ::', () => {
    expect(rootSessionKey('/root', 'sess1')).toBe('/root::sess1');
  });
});

describe('pairKey', () => {
  it('produces consistent key regardless of argument order', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });
  it('lexicographically smaller id goes first', () => {
    expect(pairKey('b', 'a')).toBe('a||b');
  });
});

describe('extractSessionId', () => {
  it('extracts session from root::session key', () => {
    expect(extractSessionId('/root::sess1')).toBe('sess1');
  });
  it('returns key unchanged when no :: present', () => {
    expect(extractSessionId('plain')).toBe('plain');
  });
});

// ── Severity ─────────────────────────────────────────────────────────────────

describe('severityForSymbols', () => {
  const sym = (id: string) => ({ id, filePath: 'f.ts', name: id, type: 'function' as const, line: 1 });

  it('returns info when either side has no symbols', () => {
    expect(severityForSymbols([], [sym('a')])).toBe('info');
    expect(severityForSymbols([sym('a')], [])).toBe('info');
  });

  it('returns blocking when both sides share a symbol id', () => {
    expect(severityForSymbols([sym('fn1')], [sym('fn1'), sym('fn2')])).toBe('blocking');
  });

  it('returns info when symbols differ', () => {
    expect(severityForSymbols([sym('fn1')], [sym('fn2')])).toBe('info');
  });
});

// ── shouldClearDismiss ────────────────────────────────────────────────────────

describe('shouldClearDismiss', () => {
  it('returns false when no new overlapping file was added', () => {
    const dismissed = {
      filesA: new Set(['a.ts']),
      filesB: new Set(['a.ts']),
    };
    expect(shouldClearDismiss(dismissed, new Set(['a.ts']), new Set(['a.ts']))).toBe(false);
  });

  it('returns true when side A adds a file already in side B', () => {
    const dismissed = { filesA: new Set(['a.ts']), filesB: new Set(['a.ts', 'b.ts']) };
    expect(shouldClearDismiss(dismissed, new Set(['a.ts', 'b.ts']), new Set(['a.ts', 'b.ts']))).toBe(true);
  });

  it('returns true when side B adds a file already in side A', () => {
    const dismissed = { filesA: new Set(['a.ts', 'b.ts']), filesB: new Set(['a.ts']) };
    expect(shouldClearDismiss(dismissed, new Set(['a.ts', 'b.ts']), new Set(['a.ts', 'b.ts']))).toBe(true);
  });

  it('returns false when side A adds non-overlapping file', () => {
    const dismissed = { filesA: new Set(['a.ts']), filesB: new Set(['a.ts']) };
    expect(shouldClearDismiss(dismissed, new Set(['a.ts', 'c.ts']), new Set(['a.ts']))).toBe(false);
  });
});

// ── getOrCreateEntry ──────────────────────────────────────────────────────────

describe('getOrCreateEntry', () => {
  it('creates a new entry when none exists', () => {
    const map: RootSessionMap = new Map();
    const entry = getOrCreateEntry(map, '/r', 's1');
    expect(entry.files.size).toBe(0);
    expect(map.size).toBe(1);
  });

  it('returns existing entry on second call', () => {
    const map: RootSessionMap = new Map();
    const a = getOrCreateEntry(map, '/r', 's1');
    a.files.add('x.ts');
    const b = getOrCreateEntry(map, '/r', 's1');
    expect(b.files.has('x.ts')).toBe(true);
    expect(map.size).toBe(1);
  });
});

// ── getSessionsForRoot ────────────────────────────────────────────────────────

describe('getSessionsForRoot', () => {
  it('returns only sessions for the given root', () => {
    const map: RootSessionMap = new Map([
      ['/r1::s1', { files: new Set(), latestFile: '' }],
      ['/r1::s2', { files: new Set(), latestFile: '' }],
      ['/r2::s3', { files: new Set(), latestFile: '' }],
    ]);
    const result = getSessionsForRoot(map, '/r1');
    expect(result).toHaveLength(2);
    expect(result.map((x) => x.sessionId)).toContain('s1');
    expect(result.map((x) => x.sessionId)).toContain('s2');
  });
});

// ── buildOverlapSymbols ───────────────────────────────────────────────────────

describe('buildOverlapSymbols', () => {
  const sym = (id: string) => ({ id, filePath: 'f.ts', name: id, type: 'function' as const, line: 1 });

  it('returns symbols present in both sets', () => {
    const result = buildOverlapSymbols([sym('fn1'), sym('fn2')], [sym('fn2'), sym('fn3')]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('fn2');
  });

  it('returns empty when no overlap', () => {
    expect(buildOverlapSymbols([sym('fn1')], [sym('fn2')])).toHaveLength(0);
  });
});

// ── isGraphHot ────────────────────────────────────────────────────────────────

describe('isGraphHot', () => {
  it('returns true when controller is initialized', () => {
    mockGetStatus.mockReturnValueOnce({ initialized: true });
    expect(isGraphHot('/root')).toBe(true);
  });

  it('returns false when controller reports uninitialized', () => {
    mockGetStatus.mockReturnValueOnce({ initialized: false });
    expect(isGraphHot('/root')).toBe(false);
  });
});

// ── computeSymbols ────────────────────────────────────────────────────────────

describe('computeSymbols', () => {
  it('returns affectedSymbols from controller', async () => {
    const sym = { id: 'f.ts::fn', filePath: 'f.ts', name: 'fn', type: 'function', line: 1 };
    mockDetectChangesForSession.mockResolvedValueOnce({
      changedFiles: ['f.ts'],
      affectedSymbols: [sym],
      blastRadius: 1,
    });
    const result = await computeSymbols('/root', 'sess1', ['f.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('fn');
  });

  it('returns empty array when controller is cold', async () => {
    mockGetStatus.mockReturnValueOnce({ initialized: false });
    const result = await computeSymbols('/root', 'sess1', ['f.ts']);
    expect(result).toHaveLength(0);
  });
});
