/**
 * contextDecisionWriter.test.ts — Unit tests for the context decision JSONL writer.
 *
 * All I/O is injected via DecisionWriterDeps — no real filesystem touched.
 * Uses vi.useFakeTimers() to control the 50 ms flush timer deterministically.
 *
 * Phase G (Wave 29.5 M2): asserts writes go to a date-stamped path.
 */

import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { DecisionWriterDeps } from './contextDecisionWriter';
import {
  _resetDecisionWriterForTests,
  closeDecisionWriter,
  createDecisionWriter,
  getDecisionWriter,
  initDecisionWriter,
} from './contextDecisionWriter';
import type { ContextDecision } from './contextTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDecision(overrides: Partial<ContextDecision> = {}): ContextDecision {
  return {
    id: 'dec-1',
    traceId: 'trace-abc',
    fileId: 'src/main/hooks.ts',
    features: { score: 56, reasons: [{ kind: 'git_diff', weight: 56 }], pagerank_score: null, included: true },
    score: 56,
    included: true,
    ...overrides,
  };
}

const TEST_DIR = path.sep + 'userData';
const TODAY = '2026-04-16';
const DATED_FILENAME = `context-decisions-${TODAY}.jsonl`;
const DATED_PATH = path.join(TEST_DIR, DATED_FILENAME);

function makeDeps(fileSize = 0, stamp = TODAY): {
  deps: DecisionWriterDeps;
  appended: Array<{ fp: string; line: string }>;
  rotated: string[][];
  unlinked: string[];
} {
  const appended: Array<{ fp: string; line: string }> = [];
  const rotated: string[][] = [];
  const unlinked: string[] = [];

  const deps: DecisionWriterDeps = {
    getDir: () => TEST_DIR,
    readSize: vi.fn(async () => fileSize),
    appendLine: vi.fn(async (fp, line) => { appended.push({ fp, line }); }),
    rotate: vi.fn(async (src, dst) => { rotated.push([src, dst]); }),
    unlink: vi.fn(async (fp) => { unlinked.push(fp); }),
    todayStamp: () => stamp,
  };

  return { deps, appended, rotated, unlinked };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('createDecisionWriter — flush timer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('batches multiple decisions in one appendLine call after 50 ms', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision({ id: 'dec-1' }));
    writer.recordDecision(makeDecision({ id: 'dec-2' }));

    expect(appended).toHaveLength(0); // not yet flushed

    await vi.advanceTimersByTimeAsync(50);

    expect(appended).toHaveLength(1);
    const lines = appended[0].line.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ id: 'dec-1' });
    expect(JSON.parse(lines[1])).toMatchObject({ id: 'dec-2' });
  });

  it('does not double-flush when timer fires then flushPendingWrites is called', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision());
    await vi.advanceTimersByTimeAsync(50);
    await writer.flushPendingWrites(); // queue is empty — no second write

    expect(appended).toHaveLength(1);
  });
});

describe('createDecisionWriter — flushPendingWrites', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('force-flushes before timer fires', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision());
    await writer.flushPendingWrites();

    expect(appended).toHaveLength(1);
    const parsed = JSON.parse(appended[0].line.trim());
    expect(parsed).toMatchObject({ traceId: 'trace-abc', fileId: 'src/main/hooks.ts' });
  });

  it('is a no-op when queue is empty', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    await writer.flushPendingWrites();
    expect(appended).toHaveLength(0);
  });
});

describe('createDecisionWriter — closeDecisionWriter', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('flushes pending queue on close', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision({ id: 'pre-close' }));
    await writer.closeDecisionWriter();

    expect(appended).toHaveLength(1);
    expect(JSON.parse(appended[0].line.trim())).toMatchObject({ id: 'pre-close' });
  });

  it('ignores recordDecision calls after close', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    await writer.closeDecisionWriter();
    writer.recordDecision(makeDecision());

    await vi.advanceTimersByTimeAsync(100);
    expect(appended).toHaveLength(0);
  });
});

describe('createDecisionWriter — date-stamped filename (Phase G)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('writes to the date-stamped path, not the legacy undated path', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision());
    await writer.flushPendingWrites();

    expect(appended).toHaveLength(1);
    expect(appended[0].fp).toBe(DATED_PATH);
    expect(appended[0].fp).not.toContain('context-decisions.jsonl');
  });

  it('two writes on the same day go to the same file', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision({ id: 'dec-1' }));
    await writer.flushPendingWrites();
    writer.recordDecision(makeDecision({ id: 'dec-2' }));
    await writer.flushPendingWrites();

    expect(appended).toHaveLength(2);
    expect(appended[0].fp).toBe(appended[1].fp);
  });
});

describe('createDecisionWriter — rotation (intraday)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not rotate when file is under 10 MB', async () => {
    const { deps, rotated } = makeDeps(1024);
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision());
    await writer.flushPendingWrites();

    expect(rotated).toHaveLength(0);
  });

  it('rotates current dated file to .1 when size exceeds 10 MB', async () => {
    const { deps, rotated } = makeDeps(11 * 1024 * 1024);
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision());
    await writer.flushPendingWrites();

    const hasPrimaryRotation = rotated.some(
      ([src, dst]) =>
        src === DATED_PATH &&
        dst === path.join(TEST_DIR, `context-decisions-${TODAY}.1.jsonl`),
    );
    expect(hasPrimaryRotation).toBe(true);
  });
});

describe('createDecisionWriter — decision shape', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('writes traceId, fileId, score, included, and features fields', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);
    const decision = makeDecision({
      traceId: 'trace-xyz',
      fileId: 'src/foo.ts',
      score: 100,
      included: false,
    });

    writer.recordDecision(decision);
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].line.trim());
    expect(parsed.traceId).toBe('trace-xyz');
    expect(parsed.fileId).toBe('src/foo.ts');
    expect(parsed.score).toBe(100);
    expect(parsed.included).toBe(false);
    expect(parsed.features).toMatchObject({ score: 56 });
  });

  it('assigns a UUID id when the incoming decision id is empty', async () => {
    const { deps, appended } = makeDeps();
    const writer = createDecisionWriter(deps);

    writer.recordDecision(makeDecision({ id: '' }));
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].line.trim());
    expect(parsed.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('singleton API', () => {
  afterEach(() => {
    _resetDecisionWriterForTests();
  });

  it('getDecisionWriter returns null before init', () => {
    expect(getDecisionWriter()).toBeNull();
  });

  it('initDecisionWriter sets the singleton', () => {
    initDecisionWriter('/fake/userData');
    expect(getDecisionWriter()).not.toBeNull();
  });

  it('initDecisionWriter is idempotent', () => {
    initDecisionWriter('/fake/userData');
    const first = getDecisionWriter();
    initDecisionWriter('/fake/userData');
    expect(getDecisionWriter()).toBe(first);
  });

  it('closeDecisionWriter clears the singleton', async () => {
    initDecisionWriter('/fake/userData');
    await closeDecisionWriter();
    expect(getDecisionWriter()).toBeNull();
  });

  it('closeDecisionWriter is a no-op when never initialised', async () => {
    await expect(closeDecisionWriter()).resolves.toBeUndefined();
  });
});
