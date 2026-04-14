/**
 * agentConflict.test.ts — Smoke tests for the agentConflict IPC handler.
 *
 * Verifies channel registration, getReports, and dismiss delegation
 * using a mocked conflictMonitor singleton.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Stub Electron ─────────────────────────────────────────────────────────────

const mockHandle = vi.fn();
const mockSend = vi.fn();
const mockGetAllWindows = vi.fn(() => [
  { isDestroyed: () => false, webContents: { send: mockSend } },
]);

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

// ── Stub conflictMonitor ──────────────────────────────────────────────────────

const mockOn = vi.fn();
const mockGetSnapshot = vi.fn().mockReturnValue({ reports: [], sessionFiles: {} });
const mockDismiss = vi.fn();

vi.mock('../agentConflict/conflictMonitor', () => ({
  getConflictMonitor: () => ({
    on: mockOn,
    getSnapshot: mockGetSnapshot,
    dismiss: mockDismiss,
  }),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Helper ────────────────────────────────────────────────────────────────────

function getHandler(channel: string) {
  const call = mockHandle.mock.calls.find(([c]) => c === channel);
  if (!call) throw new Error(`No handler registered for channel: ${channel}`);
  return call[1] as (...args: unknown[]) => unknown;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerAgentConflictHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('./agentConflict');
    mod.registerAgentConflictHandlers();
  });

  it('registers agentConflict:getReports and agentConflict:dismiss channels', () => {
    const channels = mockHandle.mock.calls.map(([c]) => c);
    expect(channels).toContain('agentConflict:getReports');
    expect(channels).toContain('agentConflict:dismiss');
  });

  it('subscribes to monitor snapshot events', () => {
    expect(mockOn).toHaveBeenCalledWith('snapshot', expect.any(Function));
  });

  it('getReports delegates to monitor.getSnapshot and returns snapshot', () => {
    const snapshot = { reports: [{ sessionA: 'a', sessionB: 'b' }], sessionFiles: {} };
    mockGetSnapshot.mockReturnValueOnce(snapshot);

    const handler = getHandler('agentConflict:getReports');
    const result = handler({}, '/project/root') as { success: boolean; snapshot: unknown };

    expect(result.success).toBe(true);
    expect(result.snapshot).toEqual(snapshot);
    expect(mockGetSnapshot).toHaveBeenCalledWith('/project/root');
  });

  it('getReports with no projectRoot returns full snapshot', () => {
    const handler = getHandler('agentConflict:getReports');
    handler({});
    expect(mockGetSnapshot).toHaveBeenCalledWith(undefined);
  });

  it('dismiss delegates to monitor.dismiss', () => {
    const handler = getHandler('agentConflict:dismiss');
    const result = handler({}, 'sessA', 'sessB') as { success: boolean };
    expect(result.success).toBe(true);
    expect(mockDismiss).toHaveBeenCalledWith('sessA', 'sessB');
  });

  it('snapshot event broadcasts to all windows', () => {
    const [, snapshotHandler] = mockOn.mock.calls.find(([ev]) => ev === 'snapshot') ?? [];
    expect(snapshotHandler).toBeDefined();

    const snapshot = { reports: [], sessionFiles: {} };
    (snapshotHandler as (s: unknown) => void)(snapshot);

    expect(mockSend).toHaveBeenCalledWith('agentConflict:change', snapshot);
  });

  it('getReports returns error result when monitor throws', () => {
    mockGetSnapshot.mockImplementationOnce(() => { throw new Error('store error'); });
    const handler = getHandler('agentConflict:getReports');
    const result = handler({}) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('store error');
  });
});
