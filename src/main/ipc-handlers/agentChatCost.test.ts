/**
 * agentChatCost.test.ts — unit tests for the cost rollup IPC sub-registrar.
 *
 * Tests the two handler functions directly without spinning up ipcMain.
 */

/* eslint-disable security/detect-object-injection */

import { describe, expect, it, vi } from 'vitest';

// Stub electron app so module-level calls to app.getPath() don't throw.
vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/test-userData') },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

vi.mock('../config', () => ({
  store: { get: vi.fn(), set: vi.fn(), onDidChange: vi.fn(() => ({ dispose: vi.fn() })) },
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

import type { AgentChatService } from '../agentChat';
import { registerCostRollupHandlers } from './agentChatCost';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireValidString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${name}`);
  }
  return value.trim();
}

function requireValidObject(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value as Record<string, unknown>;
}

function makeService(overrides: Partial<AgentChatService> = {}): AgentChatService {
  return {
    loadThread: vi.fn().mockResolvedValue({ success: false, error: 'not found' }),
    listThreads: vi.fn().mockResolvedValue({ success: true, threads: [] }),
    ...overrides,
  } as unknown as AgentChatService;
}

// Capture registered handlers by channel name
function captureHandlers(deps: Parameters<typeof registerCostRollupHandlers>[0]) {
  const captured: Record<string, (...args: unknown[]) => unknown> = {};
  const register = (
    _channels: string[],
    channel: string,
    handler: (...args: unknown[]) => unknown,
  ): void => {
    captured[channel] = handler;
  };
  registerCostRollupHandlers({ ...deps, register });
  return captured;
}

// ─── getThreadCostRollup ──────────────────────────────────────────────────────

describe('getThreadCostRollup handler', () => {
  it('returns success:false when thread not found', async () => {
    const svc = makeService({
      loadThread: vi.fn().mockResolvedValue({ success: false, error: 'not found' }),
    });
    const handlers = captureHandlers({
      channels: [],
      svc,
      register: () => {},
      requireValidString,
      requireValidObject,
    });

    const result = await handlers['agentChat:getThreadCostRollup']({ threadId: 't1' });
    expect((result as { success: boolean }).success).toBe(false);
  });

  it('returns rollup with zero tokens for thread with no messages', async () => {
    const svc = makeService({
      loadThread: vi.fn().mockResolvedValue({
        success: true,
        thread: { id: 't1', messages: [] },
      }),
    });
    const handlers = captureHandlers({
      channels: [],
      svc,
      register: () => {},
      requireValidString,
      requireValidObject,
    });

    const result = await handlers['agentChat:getThreadCostRollup']({ threadId: 't1' }) as {
      success: boolean;
      rollup: { threadId: string; totalUsd: number };
    };
    expect(result.success).toBe(true);
    expect(result.rollup.threadId).toBe('t1');
    expect(result.rollup.totalUsd).toBe(0);
  });

  it('throws on invalid payload', async () => {
    const svc = makeService();
    const handlers = captureHandlers({
      channels: [],
      svc,
      register: () => {},
      requireValidString,
      requireValidObject,
    });

    await expect(handlers['agentChat:getThreadCostRollup'](null)).rejects.toThrow();
  });
});

// ─── getGlobalCostRollup ──────────────────────────────────────────────────────

describe('getGlobalCostRollup handler', () => {
  it('returns empty rollup when no threads', async () => {
    const svc = makeService({
      listThreads: vi.fn().mockResolvedValue({ success: true, threads: [] }),
    });
    const handlers = captureHandlers({
      channels: [],
      svc,
      register: () => {},
      requireValidString,
      requireValidObject,
    });

    const result = await handlers['agentChat:getGlobalCostRollup'](null) as {
      success: boolean;
      rollup: { threadCount: number; totalUsd: number };
      threads: unknown[];
    };
    expect(result.success).toBe(true);
    expect(result.rollup.threadCount).toBe(0);
    expect(result.rollup.totalUsd).toBe(0);
    expect(result.threads).toHaveLength(0);
  });

  it('filters threads by timeRange when provided', async () => {
    const now = Date.now();
    const threads = [
      { id: 'old', messages: [], createdAt: now - 100_000_000 },
      { id: 'new', messages: [], createdAt: now - 1000 },
    ];
    const svc = makeService({
      listThreads: vi.fn().mockResolvedValue({ success: true, threads }),
    });
    const handlers = captureHandlers({
      channels: [],
      svc,
      register: () => {},
      requireValidString,
      requireValidObject,
    });

    const payload = { timeRange: { from: now - 60_000, to: now + 1000 } };
    const result = await handlers['agentChat:getGlobalCostRollup'](payload) as {
      success: boolean;
      rollup: { threadCount: number };
      threads: unknown[];
    };
    expect(result.success).toBe(true);
    expect(result.rollup.threadCount).toBe(1);
    expect(result.threads).toHaveLength(1);
  });

  it('returns success:false when listThreads fails', async () => {
    const svc = makeService({
      listThreads: vi.fn().mockResolvedValue({ success: false, error: 'DB error' }),
    });
    const handlers = captureHandlers({
      channels: [],
      svc,
      register: () => {},
      requireValidString,
      requireValidObject,
    });

    const result = await handlers['agentChat:getGlobalCostRollup'](null) as {
      success: boolean;
    };
    expect(result.success).toBe(false);
  });
});
