/**
 * preloadSupplementalMemoryApis.test.ts
 *
 * Verifies each memoryApi method invokes the correct IPC channel and
 * that the onChanged subscription wires / unwires correctly.
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

import { memoryApi } from './preloadSupplementalMemoryApis';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
  mockOn.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('memoryApi', () => {
  describe('list()', () => {
    it('invokes memory:list with undefined projectRoot when omitted', async () => {
      await memoryApi.list();
      expect(mockInvoke).toHaveBeenCalledWith('memory:list', { projectRoot: undefined });
    });

    it('invokes memory:list with the supplied projectRoot', async () => {
      await memoryApi.list('/home/user/project');
      expect(mockInvoke).toHaveBeenCalledWith('memory:list', {
        projectRoot: '/home/user/project',
      });
    });
  });

  describe('read()', () => {
    it('invokes memory:read with projectRoot and id', async () => {
      await memoryApi.read({ projectRoot: '/home/user/project', id: 'MEMORY' });
      expect(mockInvoke).toHaveBeenCalledWith('memory:read', {
        projectRoot: '/home/user/project',
        id: 'MEMORY',
      });
    });

    it('invokes memory:read without projectRoot when omitted', async () => {
      await memoryApi.read({ id: 'some-entry' });
      expect(mockInvoke).toHaveBeenCalledWith('memory:read', { id: 'some-entry' });
    });
  });

  describe('onChanged()', () => {
    it('registers a listener on memory:changed', () => {
      const cb = vi.fn();
      memoryApi.onChanged(cb);
      expect(mockOn).toHaveBeenCalledWith('memory:changed', expect.any(Function));
    });

    it('returns a cleanup function that calls removeListener', () => {
      const cb = vi.fn();
      const cleanup = memoryApi.onChanged(cb);
      cleanup();
      expect(mockRemoveListener).toHaveBeenCalledWith('memory:changed', expect.any(Function));
    });

    it('strips IpcRendererEvent and forwards void payload to callback', () => {
      const cb = vi.fn();
      memoryApi.onChanged(cb);
      const handler = mockOn.mock.calls[0][1] as (event: unknown, payload: unknown) => void;
      handler({} /* IpcRendererEvent */, undefined);
      expect(cb).toHaveBeenCalledWith(undefined);
    });
  });
});
