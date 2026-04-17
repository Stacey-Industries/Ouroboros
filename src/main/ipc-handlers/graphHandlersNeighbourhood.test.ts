/**
 * graphHandlersNeighbourhood.test.ts — Unit tests for neighbourhood + blast-radius
 * IPC handler registration.
 *
 * Tests that:
 * 1. Both channels are registered with the correct names.
 * 2. The handlers return GRAPH_NOT_INIT when no controller is available.
 * 3. The handlers return an error when the compat handle is unavailable.
 * 4. Neighbourhood result correctly categorises callers / callees / imports.
 * 5. Blast-radius result assigns criticality based on in-degree.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Electron stub ─────────────────────────────────────────────────────────────

const handleCalls: Array<[string, (...args: unknown[]) => unknown]> = [];

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handleCalls.push([channel, handler]);
    }),
  },
}));

// ── Graph controller stub ─────────────────────────────────────────────────────

const mockController = { handle: null as unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetGraphController = vi.fn<() => any>(() => mockController);

vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphController: () => mockGetGraphController(),
}));

// ── toSystem1GraphNode stub ───────────────────────────────────────────────────

vi.mock('../codebaseGraph/graphControllerCompatAdapters', () => ({
  toSystem1GraphNode: vi.fn((n: unknown) => n),
}));

// ── Import after mocks are in place ──────────────────────────────────────────

import { registerGraphNeighbourhoodChannels } from './graphHandlersNeighbourhood';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(id: string, label = 'Function') {
  return { id, name: id, label, file_path: `src/${id}.ts`, start_line: 1, end_line: 10, project: 'test', qualified_name: id, props: {} };
}

function makeDb(overrides: Partial<{
  getNode: (id: string) => ReturnType<typeof makeNode> | null;
  searchNodes: (filter: unknown) => { nodes: ReturnType<typeof makeNode>[] };
  bfsTraversal: (opts: unknown) => Array<{ id: string; depth: number; path: string[] }>;
  getNodeDegree: (id: string, type?: unknown, dir?: unknown) => number;
}> = {}) {
  return {
    getNode: vi.fn((id: string) => makeNode(id)),
    searchNodes: vi.fn(() => ({ nodes: [] })),
    bfsTraversal: vi.fn(() => []),
    getNodeDegree: vi.fn(() => 0),
    ...overrides,
  };
}

function captureHandlers(): Map<string, (...args: unknown[]) => Promise<unknown>> {
  handleCalls.length = 0;
  const channels: string[] = [];
  registerGraphNeighbourhoodChannels(channels);
  const map = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  for (const [ch, fn] of handleCalls) {
    map.set(ch, fn as (...args: unknown[]) => Promise<unknown>);
  }
  return map;
}

const FAKE_EVENT = {} as Electron.IpcMainInvokeEvent;

// ─────────────────────────────────────────────────────────────────────────────

describe('registerGraphNeighbourhoodChannels', () => {
  beforeEach(() => {
    handleCalls.length = 0;
    mockGetGraphController.mockReset();
    mockGetGraphController.mockReturnValue(mockController);
  });

  it('registers graph:getNeighbourhood channel', () => {
    const channels: string[] = [];
    registerGraphNeighbourhoodChannels(channels);
    expect(channels).toContain('graph:getNeighbourhood');
  });

  it('registers graph:getBlastRadius channel', () => {
    const channels: string[] = [];
    registerGraphNeighbourhoodChannels(channels);
    expect(channels).toContain('graph:getBlastRadius');
  });

  describe('graph:getNeighbourhood', () => {
    it('returns GRAPH_NOT_INIT when controller is null', async () => {
      mockGetGraphController.mockReturnValue(null);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getNeighbourhood')!;
      const result = await handler(FAKE_EVENT, 'someSymbol', 1) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not initialized/i);
    });

    it('returns error when handle is not available on controller', async () => {
      mockGetGraphController.mockReturnValue({ handle: null } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getNeighbourhood')!;
      const result = await handler(FAKE_EVENT, 'sym', 1) as { success: boolean; error: string };
      expect(result.success).toBe(false);
    });

    it('returns error when symbol not found in DB', async () => {
      const db = makeDb({ getNode: vi.fn(() => null), searchNodes: vi.fn(() => ({ nodes: [] })) });
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getNeighbourhood')!;
      const result = await handler(FAKE_EVENT, 'unknown', 1) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('returns callers, callees, imports arrays on success', async () => {
      const targetNode = makeNode('target');
      const callerNode = makeNode('caller');
      const db = makeDb({
        getNode: vi.fn((id: string) => id === 'target' ? targetNode : callerNode),
        bfsTraversal: vi.fn((opts: unknown) =>
          (opts as { direction: string }).direction === 'inbound'
            ? [{ id: 'caller', depth: 1, path: ['target', 'caller'] }]
            : [],
        ),
      });
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getNeighbourhood')!;
      const result = await handler(FAKE_EVENT, 'target', 1) as {
        success: boolean;
        callers: unknown[];
        callees: unknown[];
        imports: unknown[];
      };
      expect(result.success).toBe(true);
      expect(Array.isArray(result.callers)).toBe(true);
      expect(Array.isArray(result.callees)).toBe(true);
      expect(Array.isArray(result.imports)).toBe(true);
    });

    it('clamps depth to maximum of 3', async () => {
      const targetNode = makeNode('fn');
      const db = makeDb({ getNode: vi.fn(() => targetNode) });
      const bfsSpy = db.bfsTraversal;
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getNeighbourhood')!;
      await handler(FAKE_EVENT, 'fn', 99);
      const calls = (bfsSpy as ReturnType<typeof vi.fn>).mock.calls as Array<[{ maxDepth: number }]>;
      for (const [opts] of calls) {
        expect(opts.maxDepth).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('graph:getBlastRadius', () => {
    it('returns GRAPH_NOT_INIT when controller is null', async () => {
      mockGetGraphController.mockReturnValue(null);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getBlastRadius')!;
      const result = await handler(FAKE_EVENT, 'sym', 2) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('returns error when symbol not found', async () => {
      const db = makeDb({ getNode: vi.fn(() => null), searchNodes: vi.fn(() => ({ nodes: [] })) });
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getBlastRadius')!;
      const result = await handler(FAKE_EVENT, 'ghost', 2) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('returns affectedSymbols array on success', async () => {
      const target = makeNode('myFn');
      const affected = makeNode('caller');
      const db = makeDb({
        getNode: vi.fn((id: string) => id === 'myFn' ? target : affected),
        bfsTraversal: vi.fn(() => [{ id: 'caller', depth: 1, path: ['myFn', 'caller'] }]),
        getNodeDegree: vi.fn(() => 3),
      });
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getBlastRadius')!;
      const result = await handler(FAKE_EVENT, 'myFn', 2) as {
        success: boolean;
        affectedSymbols: Array<{ distance: number; criticality: string }>;
      };
      expect(result.success).toBe(true);
      expect(result.affectedSymbols).toHaveLength(1);
      expect(result.affectedSymbols[0].distance).toBe(1);
    });

    it('classifies critical when in-degree >= 5', async () => {
      const target = makeNode('hub');
      const dependent = makeNode('dep');
      const db = makeDb({
        getNode: vi.fn((id: string) => id === 'hub' ? target : dependent),
        bfsTraversal: vi.fn(() => [{ id: 'dep', depth: 1, path: ['hub', 'dep'] }]),
        getNodeDegree: vi.fn(() => 10),
      });
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getBlastRadius')!;
      const result = await handler(FAKE_EVENT, 'hub', 2) as {
        success: boolean;
        affectedSymbols: Array<{ criticality: string }>;
      };
      expect(result.success).toBe(true);
      expect(result.affectedSymbols[0].criticality).toBe('critical');
    });

    it('classifies low for leaf nodes with in-degree 0', async () => {
      const target = makeNode('leaf');
      const dep = makeNode('leaf-dep', 'Variable');
      const db = makeDb({
        getNode: vi.fn((id: string) => id === 'leaf' ? target : dep),
        bfsTraversal: vi.fn(() => [{ id: 'leaf-dep', depth: 1, path: ['leaf', 'leaf-dep'] }]),
        getNodeDegree: vi.fn(() => 0),
      });
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getBlastRadius')!;
      const result = await handler(FAKE_EVENT, 'leaf', 2) as {
        success: boolean;
        affectedSymbols: Array<{ criticality: string }>;
      };
      expect(result.success).toBe(true);
      expect(result.affectedSymbols[0].criticality).toBe('low');
    });

    it('clamps depth to maximum of 5', async () => {
      const node = makeNode('fn');
      const db = makeDb({ getNode: vi.fn(() => node) });
      const bfsSpy = db.bfsTraversal;
      mockGetGraphController.mockReturnValue({ handle: { db, projectName: 'proj' } } as unknown as typeof mockController);
      const handlers = captureHandlers();
      const handler = handlers.get('graph:getBlastRadius')!;
      await handler(FAKE_EVENT, 'fn', 999);
      const calls = (bfsSpy as ReturnType<typeof vi.fn>).mock.calls as Array<[{ maxDepth: number }]>;
      expect(calls[0][0].maxDepth).toBeLessThanOrEqual(5);
    });
  });
});
