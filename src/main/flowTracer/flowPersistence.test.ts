/**
 * flowPersistence.test.ts — save / list / load round-trip + deletion.
 *
 * Uses a real temp directory (via os.tmpdir()) so we exercise actual fs I/O
 * without touching the live workspace. Mocks config + logger to keep it pure.
 */

import { randomUUID } from 'crypto';
import { mkdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let _saveSharedFlows = false;
let _defaultProjectRoot = '';

vi.mock('../config', () => ({
  getConfigValue: vi.fn((key: string) => {
    if (key === 'defaultProjectRoot') return _defaultProjectRoot;
    if (key === 'flowTracer') return { saveSharedFlows: _saveSharedFlows };
    return undefined;
  }),
}));

import { deleteSavedFlow, listSavedFlows, loadFlow, saveFlow } from './flowPersistence';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTrace(title: string) {
  return {
    id: randomUUID(),
    title,
    entryPoint: { symbol: 'testSymbol', file: 'src/test.ts', line: 1 },
    steps: [
      {
        id: 'step-1',
        layer: 'renderer' as const,
        symbol: 'handleClick',
        file: 'src/renderer/comp.tsx',
        line: 10,
        kind: 'function' as const,
        narration: { what: 'Handles click', why: 'Entry point', how: 'Calls IPC' },
      },
      {
        id: 'step-2',
        layer: 'main' as const,
        symbol: 'ipcHandler',
        file: 'src/main/handler.ts',
        line: 42,
        kind: 'ipc-handler' as const,
        narration: null,
      },
    ],
    edges: [
      { from: 'step-1', to: 'step-2', kind: 'boundary' as const, boundaryChannel: 'test:channel' },
    ],
    generatedAt: Date.now(),
    graphVersion: 'test-v1',
    metadata: { layerCount: 2, boundaryCount: 1, depthCapHit: false },
  };
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

let testRoot: string;

beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `flowPersistence-test-${randomUUID()}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- testRoot is test-controlled temp path, not user input
  await mkdir(testRoot, { recursive: true });
  _defaultProjectRoot = testRoot;
  _saveSharedFlows = false;
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('flowPersistence — save + load round-trip', () => {
  it('saves a flow and loads it back identically', async () => {
    const trace = makeTrace('When I send a message');
    const { id } = await saveFlow(trace, trace.title, testRoot);

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const loaded = await loadFlow(id, testRoot);
    expect(loaded.id).toBe(trace.id);
    expect(loaded.title).toBe(trace.title);
    expect(loaded.steps).toHaveLength(2);
    expect(loaded.edges).toHaveLength(1);
    expect(loaded.metadata.layerCount).toBe(2);
  });

  it('returns distinct ids for two saves of the same flow', async () => {
    const trace = makeTrace('Same flow');
    const r1 = await saveFlow(trace, trace.title, testRoot);
    const r2 = await saveFlow(trace, trace.title, testRoot);
    expect(r1.id).not.toBe(r2.id);
  });

  it('preserves narration on round-trip', async () => {
    const trace = makeTrace('Narration test');
    const { id } = await saveFlow(trace, trace.title, testRoot);
    const loaded = await loadFlow(id, testRoot);
    const firstStep = loaded.steps[0];
    expect(firstStep.narration).not.toBeNull();
    if (firstStep.narration && !('stale' in firstStep.narration)) {
      expect(firstStep.narration.what).toBe('Handles click');
      expect(firstStep.narration.why).toBe('Entry point');
    }
  });
});

describe('flowPersistence — listSavedFlows', () => {
  it('returns an empty array when no flows have been saved', async () => {
    const list = await listSavedFlows(testRoot);
    expect(list).toEqual([]);
  });

  it('lists all saved flows with correct summary shape', async () => {
    const t1 = makeTrace('Flow A');
    const t2 = makeTrace('Flow B');
    const { id: id1 } = await saveFlow(t1, t1.title, testRoot);
    const { id: id2 } = await saveFlow(t2, t2.title, testRoot);

    const list = await listSavedFlows(testRoot);
    expect(list).toHaveLength(2);

    const ids = list.map((s) => s.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);

    for (const summary of list) {
      expect(typeof summary.title).toBe('string');
      expect(typeof summary.savedAt).toBe('number');
      expect(summary.savedAt).toBeGreaterThan(0);
      expect(typeof summary.layerCount).toBe('number');
      expect(['local', 'shared']).toContain(summary.source);
    }
  });

  it('returns most-recently-saved flow first', async () => {
    const t1 = makeTrace('Older');
    const t2 = makeTrace('Newer');
    await saveFlow(t1, t1.title, testRoot);
    // Small sleep to ensure distinct savedAt timestamps
    await new Promise((r) => setTimeout(r, 5));
    await saveFlow(t2, t2.title, testRoot);

    const list = await listSavedFlows(testRoot);
    expect(list[0].title).toBe('Newer');
  });

  it('marks local flows with source: local', async () => {
    _saveSharedFlows = false;
    const trace = makeTrace('Local flow');
    await saveFlow(trace, trace.title, testRoot);
    const list = await listSavedFlows(testRoot);
    expect(list[0].source).toBe('local');
  });

  it('marks shared flows with source: shared', async () => {
    _saveSharedFlows = true;
    const trace = makeTrace('Shared flow');
    await saveFlow(trace, trace.title, testRoot);
    const list = await listSavedFlows(testRoot);
    expect(list[0].source).toBe('shared');
  });

  it('lists flows from both local and shared directories', async () => {
    _saveSharedFlows = false;
    const t1 = makeTrace('Local');
    await saveFlow(t1, t1.title, testRoot);

    _saveSharedFlows = true;
    const t2 = makeTrace('Shared');
    await saveFlow(t2, t2.title, testRoot);

    const list = await listSavedFlows(testRoot);
    expect(list).toHaveLength(2);
    const sources = list.map((s) => s.source);
    expect(sources).toContain('local');
    expect(sources).toContain('shared');
  });
});

describe('flowPersistence — saveSharedFlows setting', () => {
  it('writes to .ouroboros/flows when saveSharedFlows is false', async () => {
    _saveSharedFlows = false;
    const trace = makeTrace('Local write');
    const { id } = await saveFlow(trace, trace.title, testRoot);

    // loadFlow should find it in the local dir
    const loaded = await loadFlow(id, testRoot);
    expect(loaded.id).toBe(trace.id);
  });

  it('writes to .ouroboros-shared/flows when saveSharedFlows is true', async () => {
    _saveSharedFlows = true;
    const trace = makeTrace('Shared write');
    const { id } = await saveFlow(trace, trace.title, testRoot);

    const loaded = await loadFlow(id, testRoot);
    expect(loaded.id).toBe(trace.id);
  });
});

describe('flowPersistence — error cases', () => {
  it('throws when loading a non-existent id', async () => {
    await expect(loadFlow('no-such-id', testRoot)).rejects.toThrow('Flow not found');
  });

  it('deleteSavedFlow does not throw when id does not exist', async () => {
    await expect(deleteSavedFlow('ghost-id', testRoot)).resolves.toBeUndefined();
  });

  it('deleteSavedFlow removes the file so loadFlow fails after', async () => {
    const trace = makeTrace('To be deleted');
    const { id } = await saveFlow(trace, trace.title, testRoot);

    // confirm it exists
    const before = await loadFlow(id, testRoot);
    expect(before.id).toBe(trace.id);

    await deleteSavedFlow(id, testRoot);
    await expect(loadFlow(id, testRoot)).rejects.toThrow('Flow not found');
  });
});
