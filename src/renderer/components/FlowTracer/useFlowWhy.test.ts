/**
 * useFlowWhy.test.ts — Smoke tests for the per-flow chain-aware Why hook.
 * @vitest-environment jsdom
 *
 * Wave 85 Phase 4. Covers: idle / loading / ready / error states and
 * flow-id-change cancellation (superseded request ignored).
 *
 * Pattern mirrors useStepNarration.test.ts exactly:
 *   - vi.stubGlobal('window', ...) for the electronAPI mock
 *   - @testing-library/react renderHook + act(async()=>{}) to flush promises
 *   - No waitFor — vi.stubGlobal replaces window.document, breaking waitFor's
 *     container check. act(async()=>{}) is sufficient to drain microtasks.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowTrace, FlowWhyEntry } from '../../../shared/types/flowTracer';
import { useFlowWhy } from './useFlowWhy';

// ---------------------------------------------------------------------------
// Mock window.electronAPI via vi.stubGlobal (matches useStepNarration pattern)
// ---------------------------------------------------------------------------

const mockGetFlowWhy = vi.fn<
  [FlowTrace],
  Promise<{ success: true; entries: FlowWhyEntry[] } | { success: false; error: string }>
>();

vi.stubGlobal('window', {
  electronAPI: { flowTracer: { getFlowWhy: mockGetFlowWhy } },
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFlow(id = 'flow-abc', stepCount = 2): FlowTrace {
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
    id,
    title: 'When I send a chat message',
    entryPoint: { symbol: 'fn0', file: 'src/foo0.ts', line: 1 },
    steps,
    edges: [],
    generatedAt: 1_000_000,
    graphVersion: 'v1',
    metadata: { layerCount: 1, boundaryCount: 0, depthCapHit: false },
  };
}

function ok(entries: FlowWhyEntry[]) {
  return { success: true as const, entries };
}

function fail(error: string) {
  return { success: false as const, error };
}

/** Flush all pending promise microtasks. */
async function flushPromises(): Promise<void> {
  await act(async () => {
    /* drain microtask queue */
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetFlowWhy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Idle state
// ---------------------------------------------------------------------------

describe('useFlowWhy — idle state', () => {
  it('returns idle state when flow is null', () => {
    const { result } = renderHook(() => useFlowWhy(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.entries.size).toBe(0);
    expect(mockGetFlowWhy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('useFlowWhy — loading state', () => {
  it('is in loading state while IPC is in flight', async () => {
    // Promise never resolves — loading state stays visible
    mockGetFlowWhy.mockReturnValue(new Promise(() => undefined));
    const flow = makeFlow();

    const { result } = renderHook(() => useFlowWhy(flow));

    // After one microtask tick the effect fires and loading=true
    await act(async () => {
      /* tick */
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.entries.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ready state
// ---------------------------------------------------------------------------

describe('useFlowWhy — ready state', () => {
  it('populates the entries map when IPC returns success', async () => {
    const flow = makeFlow('flow-1');
    const entries: FlowWhyEntry[] = [
      { stepId: 'step-0', why: 'Electron security isolates the renderer layer.' },
      { stepId: 'step-1', why: 'IPC is the only sanctioned crossing point.' },
    ];
    mockGetFlowWhy.mockResolvedValue(ok(entries));

    const { result } = renderHook(() => useFlowWhy(flow));
    await flushPromises();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.entries.size).toBe(2);
    expect(result.current.entries.get('step-0')).toBe(
      'Electron security isolates the renderer layer.',
    );
    expect(result.current.entries.get('step-1')).toBe('IPC is the only sanctioned crossing point.');
  });

  it('passes the full FlowTrace to getFlowWhy', async () => {
    const flow = makeFlow('flow-2');
    mockGetFlowWhy.mockResolvedValue(ok([]));

    renderHook(() => useFlowWhy(flow));
    await flushPromises();

    expect(mockGetFlowWhy).toHaveBeenCalledOnce();
    expect(mockGetFlowWhy).toHaveBeenCalledWith(flow);
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('useFlowWhy — error state', () => {
  it('surfaces the error message when IPC returns success:false', async () => {
    const flow = makeFlow();
    mockGetFlowWhy.mockResolvedValue(fail('CLI timeout'));

    const { result } = renderHook(() => useFlowWhy(flow));
    await flushPromises();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('CLI timeout');
    expect(result.current.entries.size).toBe(0);
  });

  it('surfaces the error message when getFlowWhy rejects', async () => {
    const flow = makeFlow();
    mockGetFlowWhy.mockRejectedValue(new Error('IPC channel closed'));

    const { result } = renderHook(() => useFlowWhy(flow));
    await flushPromises();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('IPC channel closed');
    expect(result.current.entries.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Flow id change — cancellation
// ---------------------------------------------------------------------------

describe('useFlowWhy — flow id change cancellation', () => {
  it('ignores the response from the superseded flow when id changes', async () => {
    const flow1 = makeFlow('flow-old');
    const flow2 = makeFlow('flow-new');

    // flow1 request: manually controlled — resolves after flow2 completes
    let resolveFlow1!: (v: { success: true; entries: FlowWhyEntry[] }) => void;
    const flow1Promise = new Promise<{ success: true; entries: FlowWhyEntry[] }>((res) => {
      resolveFlow1 = res;
    });
    const flow2Entries: FlowWhyEntry[] = [{ stepId: 'step-0', why: 'Why from flow2.' }];

    mockGetFlowWhy.mockReturnValueOnce(flow1Promise).mockResolvedValueOnce(ok(flow2Entries));

    let currentFlow: FlowTrace | null = flow1;
    const { result, rerender } = renderHook(() => useFlowWhy(currentFlow));

    // Tick to let the effect fire for flow1
    await act(async () => {
      /* tick */
    });

    // Switch to flow2 before flow1 resolves
    currentFlow = flow2;
    rerender();

    // Flush flow2's promise
    await flushPromises();

    // Flow2 result should be in state
    expect(result.current.entries.get('step-0')).toBe('Why from flow2.');

    // Now resolve flow1 late — must be silently discarded
    await act(async () => {
      resolveFlow1(ok([{ stepId: 'step-0', why: 'Why from flow1 — should be ignored.' }]));
      await Promise.resolve();
    });

    // State unchanged — still flow2
    expect(result.current.entries.get('step-0')).toBe('Why from flow2.');
    expect(result.current.error).toBeNull();
  });

  it('resets to idle when flow changes to null', async () => {
    const flow = makeFlow();
    mockGetFlowWhy.mockResolvedValue(ok([{ stepId: 'step-0', why: 'Some why.' }]));

    let currentFlow: FlowTrace | null = flow;
    const { result, rerender } = renderHook(() => useFlowWhy(currentFlow));

    await flushPromises();
    expect(result.current.entries.size).toBe(1);

    // Switch to null
    currentFlow = null;
    rerender();

    // Effect resets synchronously when flow becomes null
    expect(result.current.entries.size).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
