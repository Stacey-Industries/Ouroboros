/**
 * contextOutcomeWriter.test.ts — Unit tests for the context outcome JSONL writer.
 *
 * All I/O is injected via OutcomeWriterDeps — no real filesystem touched.
 * Uses vi.useFakeTimers() to control the 50 ms flush timer deterministically.
 */

import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { OutcomeWriterDeps } from './contextOutcomeWriter';
import {
  _resetOutcomeWriterForTests,
  closeOutcomeWriter,
  createOutcomeWriter,
  getOutcomeWriter,
  initOutcomeWriter,
} from './contextOutcomeWriter';
import type { ContextOutcome } from './contextTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOutcome(overrides: Partial<ContextOutcome> = {}): ContextOutcome {
  return {
    traceId: 'trace-1',
    fileId: 'src/a.ts',
    sessionId: 'sess-1',
    timestamp: 1_700_000_000_000,
    kind: 'used',
    toolKind: 'read',
    toolUsed: 'Read',
    schemaVersion: 2,
    decisionId: 'dec-1',
    ...overrides,
  };
}

const BASE_PATH = path.join(path.sep + 'userData', 'context-outcomes.jsonl');

function makeDeps(fileSize = 0): {
  deps: OutcomeWriterDeps;
  appended: string[];
  rotated: string[][];
  unlinked: string[];
} {
  const appended: string[] = [];
  const rotated: string[][] = [];
  const unlinked: string[] = [];

  const deps: OutcomeWriterDeps = {
    getPath: () => BASE_PATH,
    readSize: vi.fn(async () => fileSize),
    appendLine: vi.fn(async (_fp, line) => {
      appended.push(line);
    }),
    rotate: vi.fn(async (src, dst) => {
      rotated.push([src, dst]);
    }),
    unlink: vi.fn(async (fp) => {
      unlinked.push(fp);
    }),
    listDir: vi.fn(async () => []),
  };

  return { deps, appended, rotated, unlinked };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('createOutcomeWriter — flush timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches multiple outcomes in one appendLine call after 50 ms', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome({ fileId: 'src/a.ts' }));
    writer.recordOutcome(makeOutcome({ fileId: 'src/b.ts' }));

    expect(appended).toHaveLength(0); // not yet flushed

    await vi.advanceTimersByTimeAsync(50);

    expect(appended).toHaveLength(1);
    const lines = appended[0].split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ fileId: 'src/a.ts' });
    expect(JSON.parse(lines[1])).toMatchObject({ fileId: 'src/b.ts' });
  });

  it('does not double-flush when timer fires then flushPendingWrites is called', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome());
    await vi.advanceTimersByTimeAsync(50);
    await writer.flushPendingWrites(); // queue is empty — no second write

    expect(appended).toHaveLength(1);
  });
});

describe('createOutcomeWriter — flushPendingWrites', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('force-flushes before timer fires', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome());
    await writer.flushPendingWrites();

    expect(appended).toHaveLength(1);
    const parsed = JSON.parse(appended[0].trim());
    expect(parsed).toMatchObject({ fileId: 'src/a.ts', kind: 'used' });
  });

  it('is a no-op when queue is empty', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    await writer.flushPendingWrites();
    expect(appended).toHaveLength(0);
  });
});

describe('createOutcomeWriter — closeOutcomeWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes pending queue on close', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome({ fileId: 'src/pre-close.ts' }));
    await writer.closeOutcomeWriter();

    expect(appended).toHaveLength(1);
    expect(JSON.parse(appended[0].trim())).toMatchObject({ fileId: 'src/pre-close.ts' });
  });

  it('ignores recordOutcome calls after close', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    await writer.closeOutcomeWriter();
    writer.recordOutcome(makeOutcome());

    await vi.advanceTimersByTimeAsync(100);
    expect(appended).toHaveLength(0);
  });
});

describe('createOutcomeWriter — rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not rotate when file is under 10 MB', async () => {
    const { deps, rotated } = makeDeps(1024);
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome());
    await writer.flushPendingWrites();

    expect(rotated).toHaveLength(0);
  });

  it('rotates current file to .1 when size exceeds 10 MB', async () => {
    const { deps, rotated } = makeDeps(11 * 1024 * 1024);
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome());
    await writer.flushPendingWrites();

    const dir = path.dirname(BASE_PATH);
    const hasPrimaryRotation = rotated.some(
      ([src, dst]) =>
        src === BASE_PATH && dst === path.join(dir, 'context-outcomes.1.jsonl'),
    );
    expect(hasPrimaryRotation).toBe(true);
  });

  it('unlinks the .3 rotation (purge oldest) when rotating over 10 MB', async () => {
    const { deps, unlinked } = makeDeps(11 * 1024 * 1024);
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome());
    await writer.flushPendingWrites();

    const dir = path.dirname(BASE_PATH);
    expect(unlinked).toContain(path.join(dir, 'context-outcomes.3.jsonl'));
  });
});

describe('createOutcomeWriter — outcome shape (schemaVersion 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits traceId, fileId, sessionId, timestamp, toolKind, schemaVersion: 2', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);
    const outcome = makeOutcome({
      traceId: 'trace-xyz',
      fileId: 'src/foo.ts',
      sessionId: 'sess-abc',
      timestamp: 1_700_000_001_000,
      kind: 'used',
      toolKind: 'edit',
      toolUsed: 'Edit',
    });

    writer.recordOutcome(outcome);
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].trim());
    expect(parsed.traceId).toBe('trace-xyz');
    expect(parsed.fileId).toBe('src/foo.ts');
    expect(parsed.sessionId).toBe('sess-abc');
    expect(parsed.timestamp).toBe(1_700_000_001_000);
    expect(parsed.toolKind).toBe('edit');
    expect(parsed.toolUsed).toBe('Edit');
    expect(parsed.schemaVersion).toBe(2);
  });

  it('assigns a generated UUID id on every written record', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome());
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].trim());
    expect(parsed.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('writes unused outcomes with toolKind=other when no toolUsed', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome({ kind: 'unused', toolKind: 'other', toolUsed: undefined }));
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].trim());
    expect(parsed.kind).toBe('unused');
    expect(parsed.toolKind).toBe('other');
    expect(parsed.toolUsed).toBeUndefined();
    expect(parsed.schemaVersion).toBe(2);
  });

  it('writes decisionId field when present (legacy/debug)', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome({ decisionId: 'dec-legacy' }));
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].trim());
    expect(parsed.decisionId).toBe('dec-legacy');
  });
});

describe('singleton API', () => {
  afterEach(() => {
    _resetOutcomeWriterForTests();
  });

  it('getOutcomeWriter returns null before init', () => {
    expect(getOutcomeWriter()).toBeNull();
  });

  it('initOutcomeWriter sets the singleton', () => {
    initOutcomeWriter('/fake/userData');
    expect(getOutcomeWriter()).not.toBeNull();
  });

  it('initOutcomeWriter is idempotent', () => {
    initOutcomeWriter('/fake/userData');
    const first = getOutcomeWriter();
    initOutcomeWriter('/fake/userData');
    expect(getOutcomeWriter()).toBe(first);
  });

  it('closeOutcomeWriter clears the singleton', async () => {
    initOutcomeWriter('/fake/userData');
    await closeOutcomeWriter();
    expect(getOutcomeWriter()).toBeNull();
  });

  it('closeOutcomeWriter is a no-op when never initialised', async () => {
    await expect(closeOutcomeWriter()).resolves.toBeUndefined();
  });
});
