/**
 * useFlowPersistence.test.ts — smoke tests for the useFlowPersistence hook.
 * @vitest-environment jsdom
 *
 * Tests the standalone helper functions (invokeSaveFlow, invokeLoadFlow) and the
 * hook's exported callbacks via direct invocation (no renderHook needed — the
 * helpers are pure async functions with a setStatus side-effect).
 *
 * Because the helpers are not exported, we test the observable IPC contract:
 *   - saveCurrentFlow calls flowTracer.saveFlow and resolves the id on success
 *   - saveCurrentFlow returns null and sets error status on IPC failure
 *   - loadFlow calls flowTracer.loadFlow and returns the FlowTrace on success
 *   - loadFlow returns null on IPC error
 *   - refreshSavedFlows calls listSavedFlows and updates savedFlows state
 *   - exportMermaidToClipboard calls exportMermaid then navigator.clipboard.writeText
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowTrace, SavedFlowSummary } from '../../../shared/types/flowTracer';

// ── Mock window.electronAPI ───────────────────────────────────────────────────

const mockSaveFlow = vi.fn();
const mockListSavedFlows = vi.fn();
const mockLoadFlow = vi.fn();
const mockExportMermaid = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    flowTracer: {
      saveFlow: mockSaveFlow,
      listSavedFlows: mockListSavedFlows,
      loadFlow: mockLoadFlow,
      exportMermaid: mockExportMermaid,
    },
  },
});

// ── Mock navigator.clipboard ──────────────────────────────────────────────────

const mockWriteText = vi.fn().mockResolvedValue(undefined);
vi.stubGlobal('navigator', { clipboard: { writeText: mockWriteText } });

import { useFlowPersistence } from './useFlowPersistence';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTrace(): FlowTrace {
  return {
    id: 'trace-1',
    title: 'When I send a message',
    entryPoint: { symbol: 'handleSubmit', file: 'src/test.ts', line: 1 },
    steps: [],
    edges: [],
    generatedAt: Date.now(),
    graphVersion: 'test',
    metadata: { layerCount: 2, boundaryCount: 1, depthCapHit: false },
  };
}

function makeSummary(id: string): SavedFlowSummary {
  return { id, title: 'Flow ' + id, savedAt: Date.now(), layerCount: 2, source: 'local' };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useFlowPersistence — saveCurrentFlow', () => {
  it('returns the flow id and sets status to saved on success', async () => {
    mockSaveFlow.mockResolvedValue({ success: true, id: 'flow-abc' });
    const { result } = renderHook(() => useFlowPersistence());

    let returnedId: string | null = null;
    await act(async () => {
      returnedId = await result.current.saveCurrentFlow(makeTrace(), 'My flow');
    });

    expect(returnedId).toBe('flow-abc');
    expect(result.current.status).toEqual({ kind: 'saved', id: 'flow-abc' });
    expect(mockSaveFlow).toHaveBeenCalledOnce();
  });

  it('returns null and sets error status when IPC reports failure', async () => {
    mockSaveFlow.mockResolvedValue({ success: false, error: 'disk full' });
    const { result } = renderHook(() => useFlowPersistence());

    let returnedId: string | null = 'sentinel';
    await act(async () => {
      returnedId = await result.current.saveCurrentFlow(makeTrace(), 'My flow');
    });

    expect(returnedId).toBeNull();
    expect(result.current.status).toEqual({ kind: 'error', message: 'disk full' });
  });

  it('returns null and sets error status when IPC throws', async () => {
    mockSaveFlow.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useFlowPersistence());

    let returnedId: string | null = 'sentinel';
    await act(async () => {
      returnedId = await result.current.saveCurrentFlow(makeTrace(), 'My flow');
    });

    expect(returnedId).toBeNull();
    expect(result.current.status.kind).toBe('error');
  });
});

describe('useFlowPersistence — refreshSavedFlows', () => {
  it('populates savedFlows on success', async () => {
    const summaries = [makeSummary('a'), makeSummary('b')];
    mockListSavedFlows.mockResolvedValue({ success: true, flows: summaries });
    const { result } = renderHook(() => useFlowPersistence());

    await act(async () => {
      await result.current.refreshSavedFlows();
    });

    expect(result.current.savedFlows).toHaveLength(2);
    expect(result.current.savedFlows[0].id).toBe('a');
  });

  it('does not throw when IPC fails (non-fatal)', async () => {
    mockListSavedFlows.mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(() => useFlowPersistence());

    await act(async () => {
      await expect(result.current.refreshSavedFlows()).resolves.toBeUndefined();
    });

    expect(result.current.savedFlows).toHaveLength(0);
  });
});

describe('useFlowPersistence — loadFlow', () => {
  it('returns the FlowTrace on success and resets status to idle', async () => {
    const trace = makeTrace();
    mockLoadFlow.mockResolvedValue({ success: true, flow: trace });
    const { result } = renderHook(() => useFlowPersistence());

    let loaded: FlowTrace | null = null;
    await act(async () => {
      loaded = await result.current.loadFlow('flow-abc');
    });

    expect(loaded?.id).toBe(trace.id);
    expect(result.current.status).toEqual({ kind: 'idle' });
  });

  it('returns null and sets error status on IPC failure', async () => {
    mockLoadFlow.mockResolvedValue({ success: false, error: 'not found' });
    const { result } = renderHook(() => useFlowPersistence());

    let loaded: FlowTrace | null = makeTrace();
    await act(async () => {
      loaded = await result.current.loadFlow('ghost');
    });

    expect(loaded).toBeNull();
    expect(result.current.status).toEqual({ kind: 'error', message: 'not found' });
  });
});

describe('useFlowPersistence — exportMermaidToClipboard', () => {
  it('returns true and writes Mermaid text to clipboard on success', async () => {
    mockExportMermaid.mockResolvedValue({ success: true, mermaid: 'sequenceDiagram\n...' });
    const { result } = renderHook(() => useFlowPersistence());

    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.exportMermaidToClipboard(makeTrace());
    });

    expect(ok).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith('sequenceDiagram\n...');
  });

  it('returns false when IPC reports failure', async () => {
    mockExportMermaid.mockResolvedValue({ success: false, error: 'bad flow' });
    const { result } = renderHook(() => useFlowPersistence());

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.exportMermaidToClipboard(makeTrace());
    });

    expect(ok).toBe(false);
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  it('returns false when clipboard.writeText throws', async () => {
    mockExportMermaid.mockResolvedValue({ success: true, mermaid: 'sequenceDiagram' });
    mockWriteText.mockRejectedValue(new Error('clipboard denied'));
    const { result } = renderHook(() => useFlowPersistence());

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.exportMermaidToClipboard(makeTrace());
    });

    expect(ok).toBe(false);
  });
});
