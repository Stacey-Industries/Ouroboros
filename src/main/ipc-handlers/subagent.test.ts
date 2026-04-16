/**
 * subagent.test.ts — Smoke tests for the subagent IPC handler registrar.
 *
 * Tests verify handler logic directly (not via ipcMain) by calling the
 * internal handler functions through the tracker's public API.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron before importing anything that touches it
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
}));

// Mock windowManager so broadcastSubagentUpdated doesn't blow up
vi.mock('../windowManager', () => ({
  getAllActiveWindows: vi.fn(() => []),
}));

// Mock logger
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock pty module for PTY kill tests
const mockKillPty = vi.fn();
const mockSessions = new Map<string, unknown>();
vi.mock('../pty', () => ({
  get sessions() { return mockSessions; },
  killPty: (id: string) => mockKillPty(id),
}));

import {
  _clearAll,
  get,
  recordEnd,
  recordStart,
  recordUsage,
  setPtySessionId,
} from '../agentChat/subagentTracker';
// Import after mocks are set up
import { registerSubagentHandlers } from './subagent';

// ─── Capture handlers registered with ipcMain ─────────────────────────────────

type IpcHandler = (_event: unknown, args: unknown) => Promise<unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

async function getHandlers(): Promise<Map<string, IpcHandler>> {
  const { ipcMain } = await import('electron');
  const captured = new Map<string, IpcHandler>();
  (vi.mocked(ipcMain.handle) as unknown as { mockImplementation: (fn: AnyFn) => void })
    .mockImplementation((channel: string, fn: IpcHandler) => {
      captured.set(channel as string, fn);
    });
  registerSubagentHandlers();
  return captured;
}

beforeEach(async () => {
  _clearAll();
  mockSessions.clear();
  mockKillPty.mockReset();
  vi.clearAllMocks();
});

// ─── subagent:list ────────────────────────────────────────────────────────────

describe('subagent:list', () => {
  it('returns records for the given parent', async () => {
    recordStart({ id: 's1', parentSessionId: 'p1' });
    recordStart({ id: 's2', parentSessionId: 'p1' });
    recordStart({ id: 's3', parentSessionId: 'p2' });

    const handlers = await getHandlers();
    const handler = handlers.get('subagent:list')!;
    const result = await handler(null, { parentSessionId: 'p1' }) as { success: boolean; records: unknown[] };
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
  });

  it('fails when parentSessionId is missing', async () => {
    const handlers = await getHandlers();
    const handler = handlers.get('subagent:list')!;
    const result = await handler(null, {}) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/parentSessionId/);
  });
});

// ─── subagent:get ─────────────────────────────────────────────────────────────

describe('subagent:get', () => {
  it('returns the record when found', async () => {
    recordStart({ id: 'sub-x', parentSessionId: 'p1' });
    const handlers = await getHandlers();
    const handler = handlers.get('subagent:get')!;
    const result = await handler(null, { subagentId: 'sub-x' }) as { success: boolean; record: { id: string } | null };
    expect(result.success).toBe(true);
    expect(result.record?.id).toBe('sub-x');
  });

  it('returns null record when not found', async () => {
    const handlers = await getHandlers();
    const handler = handlers.get('subagent:get')!;
    const result = await handler(null, { subagentId: 'missing' }) as { success: boolean; record: null };
    expect(result.success).toBe(true);
    expect(result.record).toBeNull();
  });

  it('fails when subagentId is missing', async () => {
    const handlers = await getHandlers();
    const handler = handlers.get('subagent:get')!;
    const result = await handler(null, {}) as { success: boolean };
    expect(result.success).toBe(false);
  });
});

// ─── subagent:liveCount ───────────────────────────────────────────────────────

describe('subagent:liveCount', () => {
  it('counts only running subagents', async () => {
    recordStart({ id: 'r1', parentSessionId: 'p1' });
    recordStart({ id: 'r2', parentSessionId: 'p1' });
    recordEnd('r2', 'completed');

    const handlers = await getHandlers();
    const handler = handlers.get('subagent:liveCount')!;
    const result = await handler(null, { parentSessionId: 'p1' }) as { success: boolean; count: number };
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });
});

// ─── subagent:costRollup ──────────────────────────────────────────────────────

describe('subagent:costRollup', () => {
  it('returns aggregated cost rollup', async () => {
    recordStart({ id: 'c1', parentSessionId: 'p1' });
    recordUsage('c1', { input: 1000, output: 500, usd: 0.03 });
    recordStart({ id: 'c2', parentSessionId: 'p1' });
    recordUsage('c2', { input: 2000, output: 1000, usd: 0.06 });

    const handlers = await getHandlers();
    const handler = handlers.get('subagent:costRollup')!;
    const result = await handler(null, { parentSessionId: 'p1' }) as {
      success: boolean;
      rollup: { inputTokens: number; outputTokens: number; usdCost: number; childCount: number };
    };
    expect(result.success).toBe(true);
    expect(result.rollup.childCount).toBe(2);
    expect(result.rollup.inputTokens).toBe(3000);
    expect(result.rollup.usdCost).toBeCloseTo(0.09);
  });
});

// ─── subagent:cancel ──────────────────────────────────────────────────────────

describe('subagent:cancel', () => {
  it('marks a running subagent as cancelled (state-only, no ptySessionId)', async () => {
    recordStart({ id: 'can-1', parentSessionId: 'p1' });

    const handlers = await getHandlers();
    const handler = handlers.get('subagent:cancel')!;
    const result = await handler(null, { subagentId: 'can-1' }) as { success: boolean };
    expect(result.success).toBe(true);
    expect(get('can-1')?.status).toBe('cancelled');
    expect(mockKillPty).not.toHaveBeenCalled();
  });

  it('kills PTY session when ptySessionId is bound and session exists', async () => {
    recordStart({ id: 'can-pty-1', parentSessionId: 'p1' });
    setPtySessionId('can-pty-1', 'pty-session-abc');
    mockSessions.set('pty-session-abc', {});
    mockKillPty.mockReturnValue({ success: true });

    const handlers = await getHandlers();
    const handler = handlers.get('subagent:cancel')!;
    const result = await handler(null, { subagentId: 'can-pty-1' }) as { success: boolean };
    expect(result.success).toBe(true);
    expect(mockKillPty).toHaveBeenCalledWith('pty-session-abc');
    expect(get('can-pty-1')?.status).toBe('cancelled');
  });

  it('falls back to state-only cancel when ptySessionId is bound but PTY not found', async () => {
    recordStart({ id: 'can-pty-2', parentSessionId: 'p1' });
    setPtySessionId('can-pty-2', 'pty-gone');
    // mockSessions does NOT contain 'pty-gone'

    const handlers = await getHandlers();
    const handler = handlers.get('subagent:cancel')!;
    const result = await handler(null, { subagentId: 'can-pty-2' }) as { success: boolean };
    expect(result.success).toBe(true);
    expect(get('can-pty-2')?.status).toBe('cancelled');
  });

  it('succeeds silently if subagent is already completed (idempotent)', async () => {
    recordStart({ id: 'can-2', parentSessionId: 'p1' });
    recordEnd('can-2', 'completed');

    const handlers = await getHandlers();
    const handler = handlers.get('subagent:cancel')!;
    const result = await handler(null, { subagentId: 'can-2' }) as { success: boolean };
    expect(result.success).toBe(true);
    expect(get('can-2')?.status).toBe('completed'); // unchanged
  });

  it('fails when subagent does not exist', async () => {
    const handlers = await getHandlers();
    const handler = handlers.get('subagent:cancel')!;
    const result = await handler(null, { subagentId: 'ghost' }) as { success: boolean };
    expect(result.success).toBe(false);
  });
});

// ─── registerSubagentHandlers — channel registration ─────────────────────────

describe('registerSubagentHandlers', () => {
  it('registers all expected channels', async () => {
    const { ipcMain } = await import('electron');
    const registered: string[] = [];
    vi.mocked(ipcMain.handle).mockImplementation((channel: string) => {
      registered.push(channel as string);
    });
    const channels = registerSubagentHandlers();
    expect(channels).toContain('subagent:list');
    expect(channels).toContain('subagent:get');
    expect(channels).toContain('subagent:liveCount');
    expect(channels).toContain('subagent:costRollup');
    expect(channels).toContain('subagent:cancel');
  });
});
