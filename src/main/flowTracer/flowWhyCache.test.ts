/**
 * flowWhyCache.test.ts — Unit tests for the per-flow chain-aware Why cache
 * (Wave 85 Phase 4).
 *
 * spawnClaude is mocked — no real Haiku calls in tests.
 * fs/promises is auto-mocked; stubs set per-test in beforeEach.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — vi.mock is hoisted to top of file by Vitest.
// Factories must NOT reference variables defined in module scope below the
// vi.mock call (they don't exist yet at hoist time).
// ---------------------------------------------------------------------------

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('../claudeMdGeneratorSupport', () => ({
  spawnClaude: vi.fn(),
}));

vi.mock('./narrationCache', () => ({
  getNarration: vi.fn().mockResolvedValue(null),
}));

// Auto-mock fs/promises — all exports become vi.fn(); stubs set in beforeEach
vi.mock('fs/promises');

// ---------------------------------------------------------------------------
// Imports (after mock declarations)
// ---------------------------------------------------------------------------

import fs from 'fs/promises';

import type { FlowTrace, FlowWhyEntry } from '../../shared/types/flowTracer';
import { spawnClaude } from '../claudeMdGeneratorSupport';
import { getConfigValue } from '../config';
import {
  generateFlowWhy,
  getFlowWhy,
  invalidateFlowWhy,
  resetWhyCircuitBreaker,
} from './flowWhyCache';
import { WHY_PLACEHOLDER } from './narrationCachePrompt';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFlow(stepCount = 2): FlowTrace {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    id: `step-${i}`,
    layer: 'renderer' as const,
    symbol: `fn${i}`,
    file: `src/foo${i}.ts`,
    line: i * 10 + 1,
    kind: 'function' as const,
    narration: null,
  }));
  return {
    id: 'flow-test-123',
    title: 'When I send a chat message',
    entryPoint: { symbol: 'fn0', file: 'src/foo0.ts', line: 1 },
    steps,
    edges: [],
    generatedAt: 1_000_000,
    graphVersion: 'v1',
    metadata: { layerCount: 1, boundaryCount: 0, depthCapHit: false },
  };
}

function validCliResponse(flow: FlowTrace): string {
  return JSON.stringify(
    flow.steps.map((s) => ({
      stepId: s.id,
      why: `Invariant for ${s.id}: Electron security isolates this layer.`,
    })),
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetWhyCircuitBreaker();

  vi.mocked(getConfigValue).mockReturnValue('C:\\project');

  // Default: no cache file on disk
  vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.unlink).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getFlowWhy — cache read
// ---------------------------------------------------------------------------

describe('getFlowWhy', () => {
  it('returns null when no workspace root is configured', async () => {
    vi.mocked(getConfigValue).mockReturnValue(undefined);
    const result = await getFlowWhy('flow-test-123');
    expect(result).toBeNull();
  });

  it('returns null on cache miss (file not found)', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    const result = await getFlowWhy('flow-test-123');
    expect(result).toBeNull();
  });

  it('returns cached entries on cache hit', async () => {
    const entries: FlowWhyEntry[] = [{ stepId: 'step-0', why: 'Cached Why.' }];
    const cacheFile = { flowId: 'flow-test-123', entries, cachedAt: Date.now() };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheFile) as never);

    const result = await getFlowWhy('flow-test-123');
    expect(result).toEqual(entries);
  });

  it('returns null when the cache file contains invalid JSON', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{ not valid json' as never);
    const result = await getFlowWhy('flow-test-123');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateFlowWhy — generation + persistence
// ---------------------------------------------------------------------------

describe('generateFlowWhy', () => {
  it('returns placeholder entries when no workspace root configured', async () => {
    vi.mocked(getConfigValue).mockReturnValue(undefined);
    const flow = makeFlow(2);
    const result = await generateFlowWhy(flow);
    expect(result).toHaveLength(2);
    for (const e of result) expect(e.why).toBe(WHY_PLACEHOLDER);
    expect(spawnClaude).not.toHaveBeenCalled();
  });

  it('calls spawnClaude and returns parsed entries on success', async () => {
    const flow = makeFlow(2);
    vi.mocked(spawnClaude).mockResolvedValue(validCliResponse(flow));

    const result = await generateFlowWhy(flow);

    expect(spawnClaude).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);
    expect(result[0].stepId).toBe('step-0');
    expect(result[0].why).toContain('Electron security');
  });

  it('persists the result to <flowId>-why.json after generation', async () => {
    const flow = makeFlow(2);
    vi.mocked(spawnClaude).mockResolvedValue(validCliResponse(flow));

    await generateFlowWhy(flow);

    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledOnce();
    const [writePath, writeContent] = vi.mocked(fs.writeFile).mock.calls[0] as [string, string];
    expect(writePath).toContain(`${flow.id}-why.json`);
    const parsed = JSON.parse(writeContent) as { flowId: string; entries: FlowWhyEntry[] };
    expect(parsed.flowId).toBe(flow.id);
    expect(parsed.entries).toHaveLength(2);
  });

  it('fills WHY_PLACEHOLDER for any steps Haiku omitted', async () => {
    const flow = makeFlow(3);
    const partialResponse = JSON.stringify([
      { stepId: 'step-0', why: 'Why step 0.' },
      { stepId: 'step-1', why: 'Why step 1.' },
    ]);
    vi.mocked(spawnClaude).mockResolvedValue(partialResponse);

    const result = await generateFlowWhy(flow);
    expect(result).toHaveLength(3);
    const step2 = result.find((e) => e.stepId === 'step-2');
    expect(step2?.why).toBe(WHY_PLACEHOLDER);
  });

  it('retries once on empty parse then returns placeholders after 2 failures', async () => {
    const flow = makeFlow(2);
    vi.mocked(spawnClaude).mockResolvedValue('not json at all');

    const result = await generateFlowWhy(flow);

    expect(spawnClaude).toHaveBeenCalledTimes(2);
    for (const e of result) expect(e.why).toBe(WHY_PLACEHOLDER);
  });

  it('returns placeholders when spawnClaude throws', async () => {
    const flow = makeFlow(2);
    vi.mocked(spawnClaude).mockRejectedValue(new Error('CLI not found'));

    const result = await generateFlowWhy(flow);

    expect(result).toHaveLength(2);
    for (const e of result) expect(e.why).toBe(WHY_PLACEHOLDER);
  });
});

// ---------------------------------------------------------------------------
// generateFlowWhy — circuit breaker
// ---------------------------------------------------------------------------

describe('generateFlowWhy — circuit breaker', () => {
  it('opens after 3 consecutive failures and skips CLI calls', async () => {
    const flow = makeFlow(1);
    vi.mocked(spawnClaude).mockRejectedValue(new Error('fail'));

    await generateFlowWhy(flow);
    await generateFlowWhy(flow);
    await generateFlowWhy(flow);

    const callCountAfter3 = vi.mocked(spawnClaude).mock.calls.length;

    // Circuit open — 4th call must not invoke CLI
    await generateFlowWhy(flow);
    expect(vi.mocked(spawnClaude).mock.calls.length).toBe(callCountAfter3);
  });

  it('resets and resumes CLI calls after resetWhyCircuitBreaker()', async () => {
    const flow = makeFlow(1);
    vi.mocked(spawnClaude).mockRejectedValue(new Error('fail'));

    await generateFlowWhy(flow);
    await generateFlowWhy(flow);
    await generateFlowWhy(flow);

    resetWhyCircuitBreaker();
    vi.mocked(spawnClaude).mockResolvedValue(validCliResponse(flow));

    const result = await generateFlowWhy(flow);
    expect(spawnClaude).toHaveBeenCalled();
    expect(result[0].why).not.toBe(WHY_PLACEHOLDER);
  });
});

// ---------------------------------------------------------------------------
// invalidateFlowWhy
// ---------------------------------------------------------------------------

describe('invalidateFlowWhy', () => {
  it('calls fs.unlink on the correct cache path', async () => {
    invalidateFlowWhy('flow-test-123');
    await Promise.resolve(); // unlink is fire-and-forget
    expect(vi.mocked(fs.unlink)).toHaveBeenCalledOnce();
    const [unlinkedPath] = vi.mocked(fs.unlink).mock.calls[0] as [string];
    expect(unlinkedPath).toContain('flow-test-123-why.json');
  });

  it('does not throw or call unlink when workspace root is missing', () => {
    vi.mocked(getConfigValue).mockReturnValue(undefined);
    expect(() => invalidateFlowWhy('flow-test-123')).not.toThrow();
    expect(vi.mocked(fs.unlink)).not.toHaveBeenCalled();
  });
});
