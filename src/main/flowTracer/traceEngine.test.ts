/**
 * traceEngine.test.ts — Wave 85 Phase 2.
 *
 * Tests for traceFlow(): graph-unavailable fallback, minimal contract
 * enforcement (≥2 steps, ≥2 layers, ≥1 boundary), depth-cap wiring,
 * and correct FlowTrace envelope shape. Graph and config are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowTrace, SymbolRef } from '../../shared/types/flowTracer';

// ── mocks set up before module import ────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn().mockReturnValue({ maxDepth: 6, saveSharedFlows: false }),
}));

const mockTraceCallPath = vi.fn();
const mockGetStatus = vi.fn().mockReturnValue({ nodeCount: 1234 });

vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphController: vi.fn(() => ({
    traceCallPath: mockTraceCallPath,
    getStatus: mockGetStatus,
  })),
}));

vi.mock('./boundaryRegistry', () => ({
  getBoundaryRegistry: vi.fn(async () => ({
    ipcMainHandlers: new Map(),
    preloadBridge: new Map(),
    builtAt: Date.now(),
  })),
}));

import { traceFlow } from './traceEngine';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENTRY: SymbolRef = {
  symbol: 'registerMessageHandlers',
  file: 'src/main/ipc-handlers/agentChat.ts',
  line: 163,
};

const EMPTY_PATH = { path: [] };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('traceFlow — envelope shape', () => {
  beforeEach(() => {
    mockTraceCallPath.mockReturnValue(EMPTY_PATH);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a FlowTrace with required top-level fields', async () => {
    const flow: FlowTrace = await traceFlow(ENTRY);
    expect(typeof flow.id).toBe('string');
    expect(flow.id.length).toBeGreaterThan(0);
    expect(typeof flow.title).toBe('string');
    expect(typeof flow.generatedAt).toBe('number');
    expect(typeof flow.graphVersion).toBe('string');
    expect(typeof flow.metadata.layerCount).toBe('number');
    expect(typeof flow.metadata.boundaryCount).toBe('number');
    expect(typeof flow.metadata.depthCapHit).toBe('boolean');
  });

  it('entryPoint in result matches the entry passed in', async () => {
    const flow = await traceFlow(ENTRY);
    expect(flow.entryPoint.symbol).toBe(ENTRY.symbol);
    expect(flow.entryPoint.file).toBe(ENTRY.file);
    expect(flow.entryPoint.line).toBe(ENTRY.line);
  });
});

describe('traceFlow — minimal contract enforcement', () => {
  afterEach(() => vi.clearAllMocks());

  it('always returns ≥2 steps when graph returns empty path', async () => {
    mockTraceCallPath.mockReturnValue(EMPTY_PATH);
    const flow = await traceFlow(ENTRY);
    expect(flow.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('always returns ≥2 distinct layers', async () => {
    mockTraceCallPath.mockReturnValue(EMPTY_PATH);
    const flow = await traceFlow(ENTRY);
    const layers = new Set(flow.steps.map((s) => s.layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);
  });

  it('always returns ≥1 boundary edge', async () => {
    mockTraceCallPath.mockReturnValue(EMPTY_PATH);
    const flow = await traceFlow(ENTRY);
    const boundary = flow.edges.filter((e) => e.kind === 'boundary');
    expect(boundary.length).toBeGreaterThanOrEqual(1);
  });

  it('boundary edges carry a boundaryChannel string', async () => {
    mockTraceCallPath.mockReturnValue(EMPTY_PATH);
    const flow = await traceFlow(ENTRY);
    for (const edge of flow.edges.filter((e) => e.kind === 'boundary')) {
      expect(typeof edge.boundaryChannel).toBe('string');
    }
  });
});

describe('traceFlow — graph-unavailable fallback', () => {
  it('uses walking-skeleton fallback when getGraphController returns null', async () => {
    const { getGraphController } = await import('../codebaseGraph/graphControllerSupport');
    vi.mocked(getGraphController).mockReturnValueOnce(null);
    const flow = await traceFlow(ENTRY);
    expect(flow.graphVersion).toContain('fallback');
    expect(flow.steps.length).toBeGreaterThanOrEqual(2);
    expect(flow.edges.some((e) => e.kind === 'boundary')).toBe(true);
  });

  it('uses fallback when traceCallPath throws', async () => {
    mockTraceCallPath.mockImplementationOnce(() => {
      throw new Error('graph error');
    });
    const flow = await traceFlow(ENTRY);
    expect(flow.graphVersion).toContain('fallback');
    expect(flow.steps.length).toBeGreaterThanOrEqual(2);
  });
});

describe('traceFlow — depth cap', () => {
  afterEach(() => vi.clearAllMocks());

  it('respects opts.maxDepth override', async () => {
    // Provide nodes at depths 0–9; with maxDepth=3 should stop early.
    const manyNodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      name: `fn${i}`,
      filePath: 'src/main/x.ts',
      startLine: i + 1,
      depth: i,
    }));
    mockTraceCallPath.mockReturnValue({ path: manyNodes });
    const flow = await traceFlow(ENTRY, { maxDepth: 3 });
    expect(flow.metadata.depthCapHit).toBe(true);
    // Steps should not exceed maxDepth + 1 (cap step itself).
    expect(flow.steps.length).toBeLessThanOrEqual(5);
  });
});

describe('traceFlow — every step has valid shape', () => {
  afterEach(() => vi.clearAllMocks());

  it('all steps have required fields with correct types', async () => {
    mockTraceCallPath.mockReturnValue(EMPTY_PATH);
    const flow = await traceFlow(ENTRY);
    for (const step of flow.steps) {
      expect(typeof step.id).toBe('string');
      expect(step.id.length).toBeGreaterThan(0);
      expect(typeof step.symbol).toBe('string');
      expect(typeof step.file).toBe('string');
      expect(typeof step.line).toBe('number');
    }
  });

  it('all edges reference existing step ids', async () => {
    mockTraceCallPath.mockReturnValue(EMPTY_PATH);
    const flow = await traceFlow(ENTRY);
    const stepIds = new Set(flow.steps.map((s) => s.id));
    for (const edge of flow.edges) {
      expect(stepIds.has(edge.from)).toBe(true);
      expect(stepIds.has(edge.to)).toBe(true);
    }
  });
});
