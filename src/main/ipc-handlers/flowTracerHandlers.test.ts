/**
 * flowTracerHandlers.test.ts — smoke tests for the flowTracer IPC registrar.
 *
 * Verifies that registerFlowTracerIpcHandlers binds the expected channels and
 * that cleanupFlowTracerHandlers removes them. Mirrors the layout.test.ts pattern.
 *
 * Deeper contract assertions (FlowTrace shape, CanonicalFlow shape) live in
 * walkingSkeleton.acceptance.test.ts — the orchestrator-owned boundary test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (ch: string, fn: (...args: unknown[]) => unknown) => handlers.set(ch, fn),
      removeHandler: (ch: string) => handlers.delete(ch),
      _handlers: handlers,
      _invoke: async (ch: string, ...args: unknown[]) => {
        const fn = handlers.get(ch);
        if (!fn) throw new Error(`No handler registered for channel: ${ch}`);
        return fn({} as Electron.IpcMainInvokeEvent, ...args);
      },
    },
  };
});

import { ipcMain } from 'electron';

import { cleanupFlowTracerHandlers, registerFlowTracerIpcHandlers } from './flowTracerHandlers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (ipcMain as any)._invoke as (ch: string, ...args: unknown[]) => Promise<unknown>;

beforeEach(() => {
  registerFlowTracerIpcHandlers();
});

afterEach(() => {
  cleanupFlowTracerHandlers();
});

describe('registerFlowTracerIpcHandlers', () => {
  it('returns the list of registered channel names', () => {
    cleanupFlowTracerHandlers();
    const channels = registerFlowTracerIpcHandlers();
    expect(channels).toContain('flowTracer:get-canonical-flows');
    expect(channels).toContain('flowTracer:trace-flow');
  });

  it('flowTracer:get-canonical-flows responds with success envelope', async () => {
    const result = (await invoke('flowTracer:get-canonical-flows')) as {
      success: boolean;
      flows?: unknown[];
    };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.flows)).toBe(true);
  });

  it('flowTracer:trace-flow responds with success envelope', async () => {
    const entry = { symbol: 'foo', file: 'src/foo.ts', line: 1 };
    const result = (await invoke('flowTracer:trace-flow', entry)) as {
      success: boolean;
      flow?: unknown;
    };
    expect(result.success).toBe(true);
    expect(result.flow).toBeDefined();
  });
});

describe('cleanupFlowTracerHandlers', () => {
  it('removes registered channels so further invocations throw', async () => {
    cleanupFlowTracerHandlers();
    await expect(invoke('flowTracer:get-canonical-flows')).rejects.toThrow(/No handler registered/);
  });
});
