/**
 * researchOutcomeWriter.test.ts — Unit tests for ResearchOutcomeWriter
 * (Wave 25 Phase D, extended Wave 29.5 Phase F).
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

  it('writes a record with all Phase F fields after flushPendingWrites', async () => {
    writer.recordOutcome({
      correlationId: 'cid-1',
      sessionId: 'sess-1',
      topic: 'react hooks',
      toolName: 'Edit',
      toolKind: 'edit',
      filePath: '/src/app.tsx',
      outcomeSignal: 'accepted',
      followupTestExit: 0,
    });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records).toHaveLength(1);
    expect(records[0].correlationId).toBe('cid-1');
    expect(records[0].sessionId).toBe('sess-1');
    expect(records[0].topic).toBe('react hooks');
    expect(records[0].toolName).toBe('Edit');
    expect(records[0].toolKind).toBe('edit');
    expect(records[0].filePath).toBe('/src/app.tsx');
    expect(records[0].outcomeSignal).toBe('accepted');
    expect(records[0].followupTestExit).toBe(0);
    expect(records[0].schemaVersion).toBe(2);
    expect(typeof records[0].id).toBe('string');
    expect(typeof records[0].timestamp).toBe('number');
  });

  it('serialises outcomeSignal: "reverted" correctly', async () => {
    writer.recordOutcome({
      correlationId: 'cid-2',
      sessionId: 'sess-2',
      topic: 'prisma',
      toolName: 'Edit',
      toolKind: 'edit',
      filePath: '/src/schema.ts',
      outcomeSignal: 'reverted',
      followupTestExit: 1,
    });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records[0].outcomeSignal).toBe('reverted');
    expect(records[0].schemaVersion).toBe(2);
  });

  it('serialises outcomeSignal: "unknown" with null followupTestExit', async () => {
    writer.recordOutcome({
      correlationId: 'cid-3',
      sessionId: 'sess-3',
      topic: 'vite config',
      toolName: 'Read',
      toolKind: 'read',
      filePath: '/vite.config.ts',
      outcomeSignal: 'unknown',
      followupTestExit: null,
    });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records[0].outcomeSignal).toBe('unknown');
    expect(records[0].followupTestExit).toBeNull();
    expect(records[0].toolKind).toBe('read');
    expect(records[0].schemaVersion).toBe(2);
  });

  it('toolKind round-trips through serialisation for all four values', async () => {
    const kinds = ['read', 'edit', 'write', 'other'] as const;
    for (const kind of kinds) {
      const { deps, state: s } = makeFakeDeps();
      const w = createResearchOutcomeWriter(deps);
      w.recordOutcome({
        correlationId: 'cid',
        sessionId: 'sess',
        topic: 't',
        toolName: 'T',
        toolKind: kind,
        filePath: '/f.ts',
        outcomeSignal: 'unknown',
        followupTestExit: null,
      });
      await w.flushPendingWrites();
      const rec = parseLines(s.written)[0];
      expect(rec.toolKind).toBe(kind);
    }
  });

  it('batches multiple records in a single flush', async () => {
    writer.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit',
      toolKind: 'edit', filePath: '/a.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    writer.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Write',
      toolKind: 'write', filePath: '/b.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records).toHaveLength(2);
  });

  it('assigns a unique id to each record', async () => {
    writer.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit',
      toolKind: 'edit', filePath: '/a.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    writer.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit',
      toolKind: 'edit', filePath: '/b.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    await writer.flushPendingWrites();
    const records = parseLines(state.written);
    expect(records[0].id).not.toBe(records[1].id);
  });

  it('does not write after closeWriter', async () => {
    await writer.closeWriter();
    writer.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit',
      toolKind: 'edit', filePath: '/a.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    await writer.flushPendingWrites();
    expect(state.written).toHaveLength(0);
  });

  it('flushes pending records on closeWriter', async () => {
    writer.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit',
      toolKind: 'edit', filePath: '/a.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    await writer.closeWriter();
    expect(parseLines(state.written)).toHaveLength(1);
  });

  it('triggers rotation when file exceeds 10 MB', async () => {
    const { deps, state: rotState } = makeFakeDeps({ readSize: async () => 11 * 1024 * 1024 });
    const rotatingWriter = createResearchOutcomeWriter(deps);
    rotatingWriter.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit',
      toolKind: 'edit', filePath: '/a.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    await rotatingWriter.flushPendingWrites();
    expect(rotState.rotations.length).toBeGreaterThan(0);
  });

  it('does not rotate when file is under 10 MB', async () => {
    writer.recordOutcome({
      correlationId: 'cid-1', sessionId: 'sess-1', topic: 'topic', toolName: 'Edit',
      toolKind: 'edit', filePath: '/a.ts', outcomeSignal: 'accepted', followupTestExit: null,
    });
    await writer.flushPendingWrites();
    expect(state.rotations).toHaveLength(0);
  });
});
