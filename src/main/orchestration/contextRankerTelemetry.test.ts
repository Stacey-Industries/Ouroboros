/**
 * contextRankerTelemetry.test.ts — Wave 53b Phase B
 *
 * Tests for online ranker hit-rate telemetry.
 *
 * Coverage:
 *   - Selection event shape (all required fields present).
 *   - Read tracking: hit increments; non-hit path doesn't.
 *   - Session-end correlation: hit summary matches expected counts.
 *   - telemetryEnabled=false short-circuits all writes (no fs interaction).
 *   - In-memory state is cleaned after flush.
 *   - fs errors are tolerated — no throws.
 */

import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockGetConfigValue, mockMkdirSync, mockAppendFile } = vi.hoisted(() => ({
  mockGetConfigValue: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockAppendFile: vi.fn((_p: unknown, _d: unknown, cb: (e: Error | null) => void) => cb(null)),
}));

vi.mock('../config', () => ({ getConfigValue: mockGetConfigValue }));
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Partial fs mock: stub only mkdirSync + appendFile; preserve everything else.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: { ...actual, mkdirSync: mockMkdirSync, appendFile: mockAppendFile },
    mkdirSync: mockMkdirSync,
    appendFile: mockAppendFile,
  };
});

import {
  flushSession,
  getActiveSessionCount,
  noteReadDuringSession,
  recordRankerSelection,
} from './contextRankerTelemetry';
import type { RankedContextFile } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE = '/workspace/myproject';
const SESSION_ID = 'sess-abc-123';

function makeRankedFile(filePath: string, score = 50): RankedContextFile {
  return {
    filePath,
    score,
    confidence: 'medium',
    reasons: [{ kind: 'git_diff', weight: 56, detail: '' }],
    snippets: [],
    truncationNotes: [],
    pagerank_score: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enabledConfig(): void {
  mockGetConfigValue.mockReturnValue({ telemetryEnabled: true });
}

function disabledConfig(): void {
  mockGetConfigValue.mockReturnValue({ telemetryEnabled: false });
}

function captureAppendedRecords(): Array<Record<string, unknown>> {
  return mockAppendFile.mock.calls.map((call) => {
    const line = call[1] as string;
    return JSON.parse(line.trim()) as Record<string, unknown>;
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetConfigValue.mockReturnValue({ telemetryEnabled: true });
  mockAppendFile.mockImplementation((_p: unknown, _d: unknown, cb: (e: Error | null) => void) =>
    cb(null),
  );
  // Flush any leftover in-memory state from prior test, then clear mock
  // call counts so tests only see writes from their own logic.
  flushSession(SESSION_ID);
  mockGetConfigValue.mockReset();
  mockMkdirSync.mockReset();
  mockAppendFile.mockReset();
  mockAppendFile.mockImplementation((_p: unknown, _d: unknown, cb: (e: Error | null) => void) =>
    cb(null),
  );
  enabledConfig();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Selection event shape ─────────────────────────────────────────────────────

describe('recordRankerSelection', () => {
  it('writes a selection record with all required fields', () => {
    const files = [
      makeRankedFile(`${WORKSPACE}/src/foo.ts`, 80),
      makeRankedFile(`${WORKSPACE}/src/bar.ts`, 40),
    ];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 5,
    });

    const records = captureAppendedRecords();
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.sessionId).toBe(SESSION_ID);
    expect(rec.workspaceRoot).toBe(WORKSPACE);
    expect(typeof rec.ts).toBe('number');
    expect(rec.totalFiles).toBe(5);
    expect(Array.isArray(rec.files)).toBe(true);
    const recFiles = rec.files as Array<Record<string, unknown>>;
    expect(recFiles).toHaveLength(2);
    expect(recFiles[0].path).toBe(path.join('src', 'foo.ts'));
    expect(recFiles[0].score).toBe(80);
    expect(recFiles[0].confidence).toBe('medium');
    expect(Array.isArray(recFiles[0].reasons)).toBe(true);
  });

  it('stores paths relative to workspaceRoot', () => {
    const files = [makeRankedFile(`${WORKSPACE}/lib/utils.ts`)];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 1,
    });
    const records = captureAppendedRecords();
    const recFiles = records[0].files as Array<Record<string, unknown>>;
    expect(recFiles[0].path).toBe(path.join('lib', 'utils.ts'));
  });

  it('records the reason kind strings', () => {
    const file: RankedContextFile = {
      ...makeRankedFile(`${WORKSPACE}/a.ts`),
      reasons: [
        { kind: 'git_diff', weight: 56, detail: '' },
        { kind: 'keyword_match', weight: 26, detail: '' },
      ],
    };
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files: [file],
      totalFiles: 1,
    });
    const records = captureAppendedRecords();
    const recFiles = records[0].files as Array<Record<string, unknown>>;
    expect(recFiles[0].reasons).toEqual(['git_diff', 'keyword_match']);
  });
});

// ─── Read tracking ─────────────────────────────────────────────────────────────

describe('noteReadDuringSession', () => {
  beforeEach(() => {
    const files = [
      makeRankedFile(`${WORKSPACE}/src/alpha.ts`),
      makeRankedFile(`${WORKSPACE}/src/beta.ts`),
    ];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 2,
    });
    mockAppendFile.mockClear();
  });

  it('a pre-loaded path contributes to hit count at flush', () => {
    noteReadDuringSession(SESSION_ID, `${WORKSPACE}/src/alpha.ts`, WORKSPACE);
    flushSession(SESSION_ID);
    const records = captureAppendedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].uniqueReadHits).toBe(1);
    expect(records[0].totalReads).toBe(1);
  });

  it('a non-pre-loaded path does not increment uniqueReadHits', () => {
    noteReadDuringSession(SESSION_ID, `${WORKSPACE}/src/other.ts`, WORKSPACE);
    flushSession(SESSION_ID);
    const records = captureAppendedRecords();
    expect(records[0].uniqueReadHits).toBe(0);
    expect(records[0].totalReads).toBe(1);
  });

  it('reading the same pre-loaded file twice counts as one unique hit', () => {
    noteReadDuringSession(SESSION_ID, `${WORKSPACE}/src/alpha.ts`, WORKSPACE);
    noteReadDuringSession(SESSION_ID, `${WORKSPACE}/src/alpha.ts`, WORKSPACE);
    flushSession(SESSION_ID);
    const records = captureAppendedRecords();
    expect(records[0].uniqueReadHits).toBe(1);
    expect(records[0].totalReads).toBe(2);
  });

  it('ignores note calls for unknown sessions', () => {
    expect(() => {
      noteReadDuringSession('unknown-session', `${WORKSPACE}/a.ts`, WORKSPACE);
    }).not.toThrow();
  });
});

// ─── Session-end correlation ───────────────────────────────────────────────────

describe('flushSession', () => {
  it('writes a hit record with correct hitsByRank array', () => {
    const files = [
      makeRankedFile(`${WORKSPACE}/rank0.ts`),
      makeRankedFile(`${WORKSPACE}/rank1.ts`),
      makeRankedFile(`${WORKSPACE}/rank2.ts`),
    ];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 3,
    });
    mockAppendFile.mockClear();

    noteReadDuringSession(SESSION_ID, `${WORKSPACE}/rank0.ts`, WORKSPACE);
    noteReadDuringSession(SESSION_ID, `${WORKSPACE}/rank2.ts`, WORKSPACE);
    flushSession(SESSION_ID);

    const records = captureAppendedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].hitsByRank).toEqual([1, 0, 1]);
    expect(records[0].preLoadedCount).toBe(3);
    expect(records[0].uniqueReadHits).toBe(2);
  });

  it('includes sessionDurationMs as a non-negative number', () => {
    const files = [makeRankedFile(`${WORKSPACE}/a.ts`)];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 1,
    });
    mockAppendFile.mockClear();
    flushSession(SESSION_ID);
    const records = captureAppendedRecords();
    expect(typeof records[0].sessionDurationMs).toBe('number');
    expect(records[0].sessionDurationMs as number).toBeGreaterThanOrEqual(0);
  });

  it('cleans up in-memory state after flush', () => {
    const files = [makeRankedFile(`${WORKSPACE}/a.ts`)];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 1,
    });
    expect(getActiveSessionCount()).toBe(1);
    flushSession(SESSION_ID);
    expect(getActiveSessionCount()).toBe(0);
  });

  it('is a no-op for an unknown session', () => {
    const countBefore = mockAppendFile.mock.calls.length;
    flushSession('no-such-session');
    expect(mockAppendFile.mock.calls.length).toBe(countBefore);
  });
});

// ─── telemetryEnabled=false ────────────────────────────────────────────────────

describe('telemetryEnabled=false', () => {
  beforeEach(() => {
    disabledConfig();
  });

  it('recordRankerSelection does not write to fs', () => {
    const files = [makeRankedFile(`${WORKSPACE}/a.ts`)];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 1,
    });
    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('noteReadDuringSession is a no-op', () => {
    expect(() => {
      noteReadDuringSession(SESSION_ID, `${WORKSPACE}/a.ts`, WORKSPACE);
    }).not.toThrow();
    expect(mockAppendFile).not.toHaveBeenCalled();
  });

  it('flushSession is a no-op and writes nothing', () => {
    flushSession(SESSION_ID);
    expect(mockAppendFile).not.toHaveBeenCalled();
  });

  it('no in-memory state is stored when disabled', () => {
    const files = [makeRankedFile(`${WORKSPACE}/a.ts`)];
    recordRankerSelection({
      sessionId: SESSION_ID,
      workspaceRoot: WORKSPACE,
      files,
      totalFiles: 1,
    });
    expect(getActiveSessionCount()).toBe(0);
  });
});

// ─── fs error tolerance ────────────────────────────────────────────────────────

describe('fs error tolerance', () => {
  it('does not throw when mkdirSync fails', () => {
    mockMkdirSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    const files = [makeRankedFile(`${WORKSPACE}/a.ts`)];
    expect(() => {
      recordRankerSelection({
        sessionId: SESSION_ID,
        workspaceRoot: WORKSPACE,
        files,
        totalFiles: 1,
      });
    }).not.toThrow();
  });

  it('does not throw when appendFile errors via callback', () => {
    mockAppendFile.mockImplementation((_p: unknown, _d: unknown, cb: (e: Error | null) => void) =>
      cb(new Error('ENOSPC')),
    );
    const files = [makeRankedFile(`${WORKSPACE}/a.ts`)];
    expect(() => {
      recordRankerSelection({
        sessionId: SESSION_ID,
        workspaceRoot: WORKSPACE,
        files,
        totalFiles: 1,
      });
    }).not.toThrow();
  });
});
