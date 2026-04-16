/**
 * preloadSupplementalSubagentApis.test.ts
 *
 * Verifies each subagentApi method invokes the correct IPC channel and
 * that the onUpdated subscription wires / unwires correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Electron mock ────────────────────────────────────────────────────────────

const { mockInvoke, mockOn, mockRemoveListener } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockOn: vi.fn(),
  mockRemoveListener: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

import { subagentApi } from './preloadSupplementalSubagentApis';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
  mockOn.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('subagentApi', () => {
  describe('list()', () => {
    it('invokes subagent:list with parentSessionId', async () => {
      await subagentApi.list({ parentSessionId: 'p1' });
      expect(mockInvoke).toHaveBeenCalledWith('subagent:list', { parentSessionId: 'p1' });
    });
  });

  describe('get()', () => {
    it('invokes subagent:get with subagentId', async () => {
      await subagentApi.get({ subagentId: 's1' });
      expect(mockInvoke).toHaveBeenCalledWith('subagent:get', { subagentId: 's1' });
    });
  });

  describe('liveCount()', () => {
    it('invokes subagent:liveCount with parentSessionId', async () => {
      await subagentApi.liveCount({ parentSessionId: 'p1' });
      expect(mockInvoke).toHaveBeenCalledWith('subagent:liveCount', { parentSessionId: 'p1' });
    });
  });

  describe('costRollup()', () => {
    it('invokes subagent:costRollup with parentSessionId', async () => {
      await subagentApi.costRollup({ parentSessionId: 'p1' });
      expect(mockInvoke).toHaveBeenCalledWith('subagent:costRollup', { parentSessionId: 'p1' });
    });
  });

  describe('cancel()', () => {
    it('invokes subagent:cancel with subagentId', async () => {
      await subagentApi.cancel({ subagentId: 's1' });
      expect(mockInvoke).toHaveBeenCalledWith('subagent:cancel', { subagentId: 's1' });
    });
  });

  describe('onUpdated()', () => {
    it('registers a listener on subagent:updated', () => {
      const cb = vi.fn();
      subagentApi.onUpdated(cb);
      expect(mockOn).toHaveBeenCalledWith('subagent:updated', expect.any(Function));
    });

    it('returns a cleanup function that calls removeListener', () => {
      const cb = vi.fn();
      const cleanup = subagentApi.onUpdated(cb);
      cleanup();
      expect(mockRemoveListener).toHaveBeenCalledWith('subagent:updated', expect.any(Function));
    });

    it('strips IpcRendererEvent and forwards payload to callback', () => {
      const cb = vi.fn();
      subagentApi.onUpdated(cb);
      const handler = mockOn.mock.calls[0][1] as (event: unknown, payload: unknown) => void;
      const payload = { parentSessionId: 'p1' };
      handler({}, payload);
      expect(cb).toHaveBeenCalledWith(payload);
    });
  });
});
