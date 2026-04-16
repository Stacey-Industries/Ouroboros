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
    decisionId: 'dec-1',
    kind: 'used',
    toolUsed: 'Read',
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

    writer.recordOutcome(makeOutcome({ decisionId: 'dec-1' }));
    writer.recordOutcome(makeOutcome({ decisionId: 'dec-2' }));

    expect(appended).toHaveLength(0); // not yet flushed

    await vi.advanceTimersByTimeAsync(50);

    expect(appended).toHaveLength(1);
    const lines = appended[0].split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ decisionId: 'dec-1' });
    expect(JSON.parse(lines[1])).toMatchObject({ decisionId: 'dec-2' });
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
    expect(parsed).toMatchObject({ decisionId: 'dec-1', kind: 'used' });
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

    writer.recordOutcome(makeOutcome({ decisionId: 'pre-close' }));
    await writer.closeOutcomeWriter();

    expect(appended).toHaveLength(1);
    expect(JSON.parse(appended[0].trim())).toMatchObject({ decisionId: 'pre-close' });
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

describe('createOutcomeWriter — outcome shape', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes decisionId, kind, and toolUsed fields', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);
    const outcome = makeOutcome({
      decisionId: 'dec-xyz',
      kind: 'missed',
      toolUsed: 'Edit',
    });

    writer.recordOutcome(outcome);
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].trim());
    expect(parsed.decisionId).toBe('dec-xyz');
    expect(parsed.kind).toBe('missed');
    expect(parsed.toolUsed).toBe('Edit');
  });

  it('assigns a generated UUID id on every written record', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome(makeOutcome());
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].trim());
    expect(parsed.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('writes unused outcomes without toolUsed field', async () => {
    const { deps, appended } = makeDeps();
    const writer = createOutcomeWriter(deps);

    writer.recordOutcome({ decisionId: 'dec-u', kind: 'unused' });
    await writer.flushPendingWrites();

    const parsed = JSON.parse(appended[0].trim());
    expect(parsed.kind).toBe('unused');
    expect(parsed.toolUsed).toBeUndefined();
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
