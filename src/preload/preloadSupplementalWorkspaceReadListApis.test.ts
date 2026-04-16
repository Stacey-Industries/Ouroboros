/**
 * preloadSupplementalWorkspaceReadListApis.test.ts
 *
 * Verifies each workspaceReadListApi method invokes the correct IPC channel and
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

import { workspaceReadListApi } from './preloadSupplementalWorkspaceReadListApis';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROOT = '/projects/my-app';
const FILE = '/projects/my-app/src/main.ts';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true, files: [] });
  mockOn.mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('workspaceReadListApi', () => {
  describe('get()', () => {
    it('invokes workspaceReadList:get with projectRoot', async () => {
      await workspaceReadListApi.get(ROOT);
      expect(mockInvoke).toHaveBeenCalledWith('workspaceReadList:get', { projectRoot: ROOT });
    });
  });

  describe('add()', () => {
    it('invokes workspaceReadList:add with projectRoot and filePath', async () => {
      await workspaceReadListApi.add(ROOT, FILE);
      expect(mockInvoke).toHaveBeenCalledWith('workspaceReadList:add', {
        projectRoot: ROOT,
        filePath: FILE,
      });
    });
  });

  describe('remove()', () => {
    it('invokes workspaceReadList:remove with projectRoot and filePath', async () => {
      await workspaceReadListApi.remove(ROOT, FILE);
      expect(mockInvoke).toHaveBeenCalledWith('workspaceReadList:remove', {
        projectRoot: ROOT,
        filePath: FILE,
      });
    });
  });

  describe('onChanged()', () => {
    it('registers a listener on workspaceReadList:changed', () => {
      const cb = vi.fn();
      workspaceReadListApi.onChanged(cb);
      expect(mockOn).toHaveBeenCalledWith('workspaceReadList:changed', expect.any(Function));
    });

    it('returns a cleanup function that calls removeListener', () => {
      const cb = vi.fn();
      const cleanup = workspaceReadListApi.onChanged(cb);
      cleanup();
      expect(mockRemoveListener).toHaveBeenCalledWith(
        'workspaceReadList:changed',
        expect.any(Function),
      );
    });

    it('strips the IpcRendererEvent and forwards payload to callback', () => {
      const cb = vi.fn();
      workspaceReadListApi.onChanged(cb);
      const registeredHandler = mockOn.mock.calls[0][1] as (
        event: unknown,
        payload: unknown,
      ) => void;
      const payload = { projectRoot: ROOT, files: [FILE] };
      registeredHandler({} /* IpcRendererEvent */, payload);
      expect(cb).toHaveBeenCalledWith(payload);
    });
  });
});
