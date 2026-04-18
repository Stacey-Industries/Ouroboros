/**
 * usageExporterHandlers.test.ts — Wave 37 Phase C
 *
 * Tests for ecosystem:exportUsage and ecosystem:lastExportInfo IPC handlers.
 *  - happy path: calls exportUsage, persists lastExport info, returns rowsWritten + path
 *  - error propagation: exportUsage rejection → { success: false, error }
 *  - lastExportInfo: returns null before any export, returns stored info after
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock Electron ────────────────────────────────────────────────────────────

const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn);
    },
  },
}));

// ─── Mock config ──────────────────────────────────────────────────────────────

const configStore = new Map<string, unknown>();

vi.mock('../config', () => ({
  getConfigValue: (key: string) => configStore.get(key),
  setConfigValue: (key: string, value: unknown) => {
    configStore.set(key, value);
  },
}));

// ─── Mock usageExporter ───────────────────────────────────────────────────────

vi.mock('../usageExporter', () => ({
  exportUsage: vi.fn(),
}));

import { exportUsage } from '../usageExporter';

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Load SUT (after mocks are in place) ─────────────────────────────────────

import { registerUsageExporterHandlers } from './usageExporterHandlers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function callHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for: ${channel}`);
  // First arg to an ipcMain.handle is the event object; pass null as a stub.
  return handler(null, ...args);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  configStore.clear();
  vi.resetAllMocks();
  registerUsageExporterHandlers();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ecosystem:exportUsage', () => {
  it('returns rowsWritten and path on success', async () => {
    vi.mocked(exportUsage).mockResolvedValue({ rowsWritten: 42, path: '/tmp/out.jsonl' });

    const result = await callHandler('ecosystem:exportUsage', {
      windowStart: 0,
      windowEnd: Date.now(),
      outputPath: '/tmp/out.jsonl',
    });

    expect(result).toMatchObject({ success: true, rowsWritten: 42, path: '/tmp/out.jsonl' });
  });

  it('persists lastExport info to config on success', async () => {
    vi.mocked(exportUsage).mockResolvedValue({ rowsWritten: 7, path: '/tmp/seven.jsonl' });

    await callHandler('ecosystem:exportUsage', {
      windowStart: 0,
      windowEnd: Date.now(),
      outputPath: '/tmp/seven.jsonl',
    });

    const ecosystem = configStore.get('ecosystem') as Record<string, unknown> | undefined;
    const info = ecosystem?.lastExport as Record<string, unknown>;
    expect(info.path).toBe('/tmp/seven.jsonl');
    expect(info.rows).toBe(7);
    expect(typeof info.at).toBe('number');
  });

  it('returns { success: false, error } when exportUsage throws', async () => {
    vi.mocked(exportUsage).mockRejectedValue(new Error('parent dir missing'));

    const result = await callHandler('ecosystem:exportUsage', {
      windowStart: 0,
      windowEnd: Date.now(),
      outputPath: '/no/such/dir/out.jsonl',
    });

    expect(result).toMatchObject({ success: false, error: 'parent dir missing' });
  });
});

describe('ecosystem:lastExportInfo', () => {
  it('returns null when no export has been recorded', async () => {
    const result = await callHandler('ecosystem:lastExportInfo') as { success: boolean; info: unknown };
    expect(result.success).toBe(true);
    expect(result.info).toBeNull();
  });

  it('returns stored info after a successful export', async () => {
    vi.mocked(exportUsage).mockResolvedValue({ rowsWritten: 3, path: '/tmp/three.jsonl' });

    await callHandler('ecosystem:exportUsage', {
      windowStart: 0,
      windowEnd: Date.now(),
      outputPath: '/tmp/three.jsonl',
    });

    const result = await callHandler('ecosystem:lastExportInfo') as { success: boolean; info: Record<string, unknown> };
    expect(result.success).toBe(true);
    expect(result.info?.path).toBe('/tmp/three.jsonl');
    expect(result.info?.rows).toBe(3);
  });
});
