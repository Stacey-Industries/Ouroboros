/**
 * preloadSupplementalFlowTracerApis.test.ts — smoke tests for the flowTracer
 * preload bridge.
 *
 * Verifies that flowTracerApi relays the two IPC channels correctly and that
 * the convenience wrappers (listFlows, runTrace) resolve on success and throw
 * on failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: { invoke: vi.fn() },
}));

import { ipcRenderer } from 'electron';

import { flowTracerApi } from './preloadSupplementalFlowTracerApis';

const mockInvoke = vi.mocked(ipcRenderer.invoke);

const STUB_FLOW = {
  title: 'stub',
  entryPoint: { symbol: 'x', file: 'f', line: 1 },
  estimatedSteps: 1,
  layers: ['main' as const],
};
const STUB_TRACE = {
  id: 't1',
  title: 'stub',
  entryPoint: { symbol: 'x', file: 'f', line: 1 },
  steps: [],
  edges: [],
  generatedAt: 0,
  graphVersion: '',
  metadata: { layerCount: 1, boundaryCount: 0, depthCapHit: false },
};

beforeEach(() => {
  mockInvoke.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('flowTracerApi.getCanonicalFlows', () => {
  it('invokes flowTracer:get-canonical-flows and returns result', async () => {
    mockInvoke.mockResolvedValue({ success: true, flows: [STUB_FLOW] });
    const result = await flowTracerApi.getCanonicalFlows();
    expect(mockInvoke).toHaveBeenCalledWith('flowTracer:get-canonical-flows');
    expect(result).toEqual({ success: true, flows: [STUB_FLOW] });
  });
});

describe('flowTracerApi.traceFlow', () => {
  it('invokes flowTracer:trace-flow with the entry point', async () => {
    const entry = { symbol: 'foo', file: 'src/foo.ts', line: 1 };
    mockInvoke.mockResolvedValue({ success: true, flow: STUB_TRACE });
    const result = await flowTracerApi.traceFlow(entry);
    expect(mockInvoke).toHaveBeenCalledWith('flowTracer:trace-flow', entry);
    expect(result).toEqual({ success: true, flow: STUB_TRACE });
  });
});

describe('flowTracerApi.listFlows', () => {
  it('returns the flows array on success', async () => {
    mockInvoke.mockResolvedValue({ success: true, flows: [STUB_FLOW] });
    const flows = await flowTracerApi.listFlows();
    expect(flows).toEqual([STUB_FLOW]);
  });

  it('throws on failure', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'boom' });
    await expect(flowTracerApi.listFlows()).rejects.toThrow('boom');
  });
});

describe('flowTracerApi.runTrace', () => {
  it('returns the FlowTrace on success', async () => {
    const entry = { symbol: 'foo', file: 'src/foo.ts', line: 1 };
    mockInvoke.mockResolvedValue({ success: true, flow: STUB_TRACE });
    const trace = await flowTracerApi.runTrace(entry);
    expect(trace).toEqual(STUB_TRACE);
  });

  it('throws on failure', async () => {
    const entry = { symbol: 'foo', file: 'src/foo.ts', line: 1 };
    mockInvoke.mockResolvedValue({ success: false, error: 'not found' });
    await expect(flowTracerApi.runTrace(entry)).rejects.toThrow('not found');
  });
});
