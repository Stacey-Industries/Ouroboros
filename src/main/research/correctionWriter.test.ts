/**
 * correctionWriter.test.ts — Unit tests for CorrectionWriter.
 * Wave 29.5 Phase H (H4).
 *
 * Covers: date-stamped filename, 10 MB rotation, schemaVersion: 2,
 * batching, closeWriter flush, no-write-after-close.
 */

import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createCorrectionWriter,
  type CorrectionRecord,
  type CorrectionWriter,
  type CorrectionWriterDeps,
} from './correctionWriter';

// ─── Test deps factory ────────────────────────────────────────────────────────

const TEST_DIR = '/fake';
const TODAY = '2026-04-16';
const DATED_PATH = path.join(TEST_DIR, `corrections-${TODAY}.jsonl`);

interface FakeDepsState {
  written: Array<{ fp: string; line: string }>;
  fileSize: number;
  rotations: Array<{ src: string; dst: string }>;
}

function makeFakeDeps(overrides: Partial<CorrectionWriterDeps> = {}): {
  deps: CorrectionWriterDeps;
  state: FakeDepsState;
} {
  const state: FakeDepsState = { written: [], fileSize: 0, rotations: [] };
  const deps: CorrectionWriterDeps = {
    getDir: () => TEST_DIR,
    readSize: async () => state.fileSize,
    appendLine: async (fp, line) => { state.written.push({ fp, line }); },
    rotate: async (src, dst) => { state.rotations.push({ src, dst }); },
    todayStamp: () => TODAY,
    ...overrides,
  };
  return { deps, state };
}

function parseLines(written: Array<{ fp: string; line: string }>): CorrectionRecord[] {
  return written
    .flatMap((w) => w.line.split('\n').filter(Boolean))
    .map((l) => JSON.parse(l) as CorrectionRecord);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CorrectionWriter', () => {
  let writer: CorrectionWriter;
  let state: FakeDepsState;

  beforeEach(() => {
    const fake = makeFakeDeps();
    writer = createCorrectionWriter(fake.deps);
    state = fake.state;
  });

  it('writes to the date-stamped path', async () => {
    writer.append({
      library: 'Zod',
      userCorrectionText: "that's deprecated in Zod 4",
      sessionId: 'sess-1',
      phrasingMatch: 'deprecated in Zod',
      confidence: 'high',
    });
    await writer.flushPendingWrites();
    expect(state.written).toHaveLength(1);
    expect(state.written[0].fp).toBe(DATED_PATH);
    expect(state.written[0].fp).not.toContain('corrections.jsonl');
  });

  it('emits schemaVersion: 2', async () => {
    writer.append({
      library: 'React',
      userCorrectionText: 'useEffect does not work that way in React 19',
      sessionId: 'sess-2',
      phrasingMatch: "doesn't work that way",
      confidence: 'medium',
    });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records[0].schemaVersion).toBe(2);
  });

  it('record contains all required fields', async () => {
    writer.append({
      library: 'Prisma',
      userCorrectionText: 'wrong API for Prisma 5',
      sessionId: 'sess-3',
      phrasingMatch: 'wrong API for Prisma',
      confidence: 'high',
    });
    await writer.flushPendingWrites();
    const [rec] = parseLines(state.written);
    expect(typeof rec.id).toBe('string');
    expect(rec.library).toBe('Prisma');
    expect(rec.userCorrectionText).toBe('wrong API for Prisma 5');
    expect(rec.sessionId).toBe('sess-3');
    expect(typeof rec.timestamp).toBe('number');
    expect(rec.phrasingMatch).toBe('wrong API for Prisma');
    expect(rec.confidence).toBe('high');
    expect(rec.schemaVersion).toBe(2);
  });

  it('assigns a unique id to each record', async () => {
    writer.append({
      library: 'Zod', userCorrectionText: 'msg1', sessionId: 's',
      phrasingMatch: 'deprecated in Zod', confidence: 'high',
    });
    writer.append({
      library: 'React', userCorrectionText: 'msg2', sessionId: 's',
      phrasingMatch: 'deprecated in React', confidence: 'high',
    });
    await writer.flushPendingWrites();
    const [a, b] = parseLines(state.written);
    expect(a.id).not.toBe(b.id);
  });

  it('batches multiple records in a single flush', async () => {
    writer.append({
      library: 'Zod', userCorrectionText: 'a', sessionId: 's',
      phrasingMatch: 'deprecated in Zod', confidence: 'high',
    });
    writer.append({
      library: 'React', userCorrectionText: 'b', sessionId: 's',
      phrasingMatch: "doesn't work that way", confidence: 'medium',
    });
    await writer.flushPendingWrites();
    expect(parseLines(state.written)).toHaveLength(2);
  });

  it('two appends on the same day go to the same file', async () => {
    writer.append({
      library: 'Zod', userCorrectionText: 'a', sessionId: 's',
      phrasingMatch: 'deprecated in Zod', confidence: 'high',
    });
    await writer.flushPendingWrites();
    writer.append({
      library: 'React', userCorrectionText: 'b', sessionId: 's',
      phrasingMatch: "doesn't work that way", confidence: 'medium',
    });
    await writer.flushPendingWrites();
    expect(state.written[0].fp).toBe(state.written[1].fp);
  });

  it('rotates when file exceeds 10 MB', async () => {
    const { deps, state: rotState } = makeFakeDeps({
      readSize: async () => 11 * 1024 * 1024,
    });
    const rotWriter = createCorrectionWriter(deps);
    rotWriter.append({
      library: 'Zod', userCorrectionText: 'msg', sessionId: 's',
      phrasingMatch: 'deprecated in Zod', confidence: 'high',
    });
    await rotWriter.flushPendingWrites();
    expect(rotState.rotations.length).toBeGreaterThan(0);
    const hasPrimary = rotState.rotations.some((r) => r.src === DATED_PATH);
    expect(hasPrimary).toBe(true);
  });

  it('does not rotate when file is under 10 MB', async () => {
    writer.append({
      library: 'Zod', userCorrectionText: 'msg', sessionId: 's',
      phrasingMatch: 'deprecated in Zod', confidence: 'high',
    });
    await writer.flushPendingWrites();
    expect(state.rotations).toHaveLength(0);
  });

  it('flushes pending records on closeWriter', async () => {
    writer.append({
      library: 'Zod', userCorrectionText: 'msg', sessionId: 's',
      phrasingMatch: 'deprecated in Zod', confidence: 'high',
    });
    await writer.closeWriter();
    expect(parseLines(state.written)).toHaveLength(1);
  });

  it('does not write after closeWriter', async () => {
    await writer.closeWriter();
    writer.append({
      library: 'Zod', userCorrectionText: 'msg', sessionId: 's',
      phrasingMatch: 'deprecated in Zod', confidence: 'high',
    });
    await writer.flushPendingWrites();
    expect(state.written).toHaveLength(0);
  });
});
