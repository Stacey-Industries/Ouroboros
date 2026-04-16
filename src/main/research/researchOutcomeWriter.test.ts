/**
 * researchOutcomeWriter.test.ts — Unit tests for ResearchOutcomeWriter (Wave 25 Phase D).
 */

import { beforeEach,describe, expect, it } from 'vitest';

import {
  createResearchOutcomeWriter,
  type ResearchOutcomeRecord,
  type ResearchOutcomeWriter,
  type ResearchOutcomeWriterDeps,
} from './researchOutcomeWriter';

// ─── Test deps factory ────────────────────────────────────────────────────────

interface FakeDepsState {
  written: string[];
  fileSize: number;
  rotations: Array<{ src: string; dst: string }>;
  unlinked: string[];
}

function makeFakeDeps(overrides: Partial<ResearchOutcomeWriterDeps> = {}): {
  deps: ResearchOutcomeWriterDeps;
  state: FakeDepsState;
} {
  const state: FakeDepsState = { written: [], fileSize: 0, rotations: [], unlinked: [] };
  const deps: ResearchOutcomeWriterDeps = {
    getPath: () => '/fake/research-outcomes.jsonl',
    readSize: async () => state.fileSize,
    appendLine: async (_fp, line) => { state.written.push(line); },
    rotate: async (src, dst) => { state.rotations.push({ src, dst }); },
    unlink: async (fp) => { state.unlinked.push(fp); },
    ...overrides,
  };
  return { deps, state };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLines(written: string[]): ResearchOutcomeRecord[] {
  return written
    .flatMap((chunk) => chunk.split('\n').filter(Boolean))
    .map((line) => JSON.parse(line) as ResearchOutcomeRecord);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResearchOutcomeWriter', () => {
  let writer: ResearchOutcomeWriter;
  let state: FakeDepsState;

  beforeEach(() => {
    const fake = makeFakeDeps();
    writer = createResearchOutcomeWriter(fake.deps);
    state = fake.state;
  });

  it('writes a record after flushPendingWrites', async () => {
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'react hooks', toolName: 'Edit', filePath: '/src/app.tsx' });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records).toHaveLength(1);
    expect(records[0].correlationId).toBe('cid-1');
    expect(records[0].sessionId).toBe('sess-1');
    expect(records[0].topic).toBe('react hooks');
    expect(records[0].toolName).toBe('Edit');
    expect(records[0].filePath).toBe('/src/app.tsx');
    expect(typeof records[0].id).toBe('string');
    expect(typeof records[0].timestamp).toBe('number');
  });

  it('batches multiple records in a single flush', async () => {
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit', filePath: '/a.ts' });
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Write', filePath: '/b.ts' });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records).toHaveLength(2);
  });

  it('assigns a unique id to each record', async () => {
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit', filePath: '/a.ts' });
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit', filePath: '/b.ts' });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records[0].id).not.toBe(records[1].id);
  });

  it('does not write after closeWriter', async () => {
    await writer.closeWriter();
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit', filePath: '/a.ts' });
    await writer.flushPendingWrites();
    expect(state.written).toHaveLength(0);
  });

  it('flushes pending records on closeWriter', async () => {
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit', filePath: '/a.ts' });
    await writer.closeWriter();
    expect(parseLines(state.written)).toHaveLength(1);
  });

  it('triggers rotation when file exceeds 10 MB', async () => {
    const { deps, state: rotState } = makeFakeDeps({ readSize: async () => 11 * 1024 * 1024 });
    const rotatingWriter = createResearchOutcomeWriter(deps);
    rotatingWriter.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit', filePath: '/a.ts' });
    await rotatingWriter.flushPendingWrites();
    expect(rotState.rotations.length).toBeGreaterThan(0);
  });

  it('does not rotate when file is under 10 MB', async () => {
    writer.recordOutcome({ correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit', filePath: '/a.ts' });
    await writer.flushPendingWrites();
    expect(state.rotations).toHaveLength(0);
  });
});
