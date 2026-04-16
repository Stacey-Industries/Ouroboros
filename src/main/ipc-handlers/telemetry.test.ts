/**
 * telemetry.test.ts — Unit tests for the telemetry IPC handler registrar.
 *
 * Mocks:
 *   - electron.ipcMain.handle — captures registered handlers for direct invocation
 *   - ../telemetry            — stub TelemetryStore via getTelemetryStore
 *   - electron.app            — provides app.getPath('downloads')
 *   - node:fs                 — intercepts writeFileSync for exportTrace
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      mockHandlers.set(channel, fn);
    },
    removeHandler: (channel: string) => {
      mockHandlers.delete(channel);
    },
  },
  app: {
    getPath: (name: string) => (name === 'downloads' ? '/tmp/downloads' : '/tmp'),
  },
}));

const mockQueryEvents = vi.fn().mockReturnValue([]);
const mockQueryOutcomes = vi.fn().mockReturnValue([]);
const mockQueryTraces = vi.fn().mockReturnValue([]);
let storeEnabled = true;

vi.mock('../telemetry', () => ({
  getTelemetryStore: () =>
    storeEnabled
      ? {
          queryEvents: mockQueryEvents,
          queryOutcomes: mockQueryOutcomes,
          queryTraces: mockQueryTraces,
        }
      : null,
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  // ipcMain.handle wraps in (_event, ...args) — pass null event
  return handler(null, ...args);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerTelemetryHandlers', () => {
  let registerTelemetryHandlers: () => string[];
  let cleanupTelemetryHandlers: () => void;

  beforeEach(async () => {
    mockHandlers.clear();
    vi.clearAllMocks();
    storeEnabled = true;
    // Re-import so module re-registers
    vi.resetModules();
    const mod = await import('./telemetry');
    registerTelemetryHandlers = mod.registerTelemetryHandlers;
    cleanupTelemetryHandlers = mod.cleanupTelemetryHandlers;
    registerTelemetryHandlers();
  });

  afterEach(() => {
    cleanupTelemetryHandlers();
  });

  it('registers all 4 channels', () => {
    expect(mockHandlers.has('telemetry:queryEvents')).toBe(true);
    expect(mockHandlers.has('telemetry:queryOutcomes')).toBe(true);
    expect(mockHandlers.has('telemetry:queryTraces')).toBe(true);
    expect(mockHandlers.has('observability:exportTrace')).toBe(true);
  });

  it('queryEvents passes pagination args to store', async () => {
    const fakeEvent = { id: 'e1', type: 'pre_tool_use', sessionId: 's1' };
    mockQueryEvents.mockReturnValueOnce([fakeEvent]);
    const result = await invoke('telemetry:queryEvents', {
      sessionId: 's1',
      limit: 50,
      offset: 0,
    });
    expect(mockQueryEvents).toHaveBeenCalledWith({
      sessionId: 's1',
      limit: 50,
      offset: 0,
      type: undefined,
    });
    expect(result).toMatchObject({ success: true, events: [fakeEvent] });
  });

  it('queryEvents returns empty array when store is null', async () => {
    storeEnabled = false;
    const result = (await invoke('telemetry:queryEvents', {})) as { events: unknown[] };
    expect(result).toMatchObject({ success: true, events: [] });
  });

  it('queryOutcomes returns outcomes for a valid eventId', async () => {
    const fakeOutcome = { eventId: 'e1', kind: 'process_exit', confidence: 'high' };
    mockQueryOutcomes.mockReturnValueOnce([fakeOutcome]);
    const result = await invoke('telemetry:queryOutcomes', 'e1');
    expect(mockQueryOutcomes).toHaveBeenCalledWith('e1');
    expect(result).toMatchObject({ success: true, outcomes: [fakeOutcome] });
  });

  it('queryOutcomes returns empty array for invalid eventId', async () => {
    const result = (await invoke('telemetry:queryOutcomes', '')) as { outcomes: unknown[] };
    expect(result).toMatchObject({ success: true, outcomes: [] });
    expect(mockQueryOutcomes).not.toHaveBeenCalled();
  });

  it('queryTraces returns traces for a valid sessionId', async () => {
    const fakeTrace = { id: 't1', sessionId: 's1', phase: 'context_build' };
    mockQueryTraces.mockReturnValueOnce([fakeTrace]);
    const result = await invoke('telemetry:queryTraces', { sessionId: 's1', limit: 10 });
    expect(mockQueryTraces).toHaveBeenCalledWith('s1', 10);
    expect(result).toMatchObject({ success: true, traces: [fakeTrace] });
  });

  it('queryTraces returns empty array for missing sessionId', async () => {
    const result = (await invoke('telemetry:queryTraces', { sessionId: '' })) as {
      traces: unknown[];
    };
    expect(result).toMatchObject({ success: true, traces: [] });
    expect(mockQueryTraces).not.toHaveBeenCalled();
  });

  it('exportTrace writes a file and returns filePath', async () => {
    mockQueryEvents.mockReturnValueOnce([{ id: 'e1', type: 'pre_tool_use' }]);
    mockQueryTraces.mockReturnValueOnce([]);
    mockQueryOutcomes.mockReturnValueOnce([]);
    const result = (await invoke('observability:exportTrace', {
      sessionId: 'abc12345',
      format: 'json',
    })) as { success: boolean; filePath: string };
    expect(result.success).toBe(true);
    expect(result.filePath).toMatch(/ouroboros-trace-abc12345/);
    expect(result.filePath).toMatch(/\.json$/);
    // Mocked app.getPath('downloads') → '/tmp/downloads'; on Windows path.join
    // normalises to backslashes. Compare via path.normalize for cross-platform.
    expect(path.normalize(result.filePath).startsWith(path.normalize('/tmp/downloads'))).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      result.filePath,
      expect.any(String),
      'utf8',
    );
  });

  it('exportTrace returns failure for missing sessionId', async () => {
    const result = (await invoke('observability:exportTrace', { sessionId: '' })) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sessionId/i);
  });

  it('cleanupTelemetryHandlers removes all 5 channels', () => {
    expect(mockHandlers.size).toBe(5);
    cleanupTelemetryHandlers();
    expect(mockHandlers.size).toBe(0);
  });

  it('exportTrace writes HAR extension when format is har', async () => {
    mockQueryEvents.mockReturnValueOnce([]);
    mockQueryTraces.mockReturnValueOnce([]);
    const result = (await invoke('observability:exportTrace', {
      sessionId: 'sess9999',
      format: 'har',
    })) as { success: boolean; filePath: string };
    expect(result.success).toBe(true);
    expect(result.filePath).toMatch(/\.har$/);
    const writtenPath = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(writtenPath).toBe(result.filePath);
    const writtenContent = JSON.parse(
      (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string,
    );
    expect(writtenContent).toHaveProperty('sessionId', 'sess9999');
    expect(writtenContent).toHaveProperty('_telemetryExport.version', '1');
  });

  it('exportTrace includes path in correct downloads directory', async () => {
    mockQueryEvents.mockReturnValueOnce([]);
    mockQueryTraces.mockReturnValueOnce([]);
    const result = (await invoke('observability:exportTrace', {
      sessionId: 'dirtest1',
      format: 'json',
    })) as { success: boolean; filePath: string };
    expect(path.normalize(path.dirname(result.filePath))).toBe(path.normalize('/tmp/downloads'));
  });
});
